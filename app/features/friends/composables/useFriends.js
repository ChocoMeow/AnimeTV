// Global shared state (singleton pattern)
const globalState = {
    friends: ref([]),
    pendingRequests: ref([]),
    loading: ref(false),
    error: ref(null),
    currentUserId: ref(null),
    friendsChannel: null,
    statusChannel: null,
    statusFriendIds: null, // last friend-id set the status channel was built for (dedupe key)
    initialized: false,
    /** Set by useFriends — resume realtime after tab sleep / network drop. */
    recover: null,
    resumeBound: false,
    recovering: false,
}

const errorMessage = (err, fallback) => (err instanceof Error ? err.message : fallback)
const sortedPair = (a, b) => [a, b].sort()

export const useFriends = (userId) => {
    const supabase = useSupabaseClient()

    // Use global shared state
    const friends = globalState.friends
    const pendingRequests = globalState.pendingRequests
    const loading = globalState.loading
    const error = globalState.error

    // Computed user ID
    const userIdRef = computed(() => {
        const id = toValue(userId)
        return id || null
    })

    // Fetch friends with status using RPC function
    const fetchFriends = async () => {
        if (!userIdRef.value) {
            friends.value = []
            return
        }

        try {
            loading.value = true
            error.value = null

            const { data, error: fetchError } = await supabase.rpc("get_friends_with_status")
            if (fetchError) throw fetchError

            friends.value = (data || []).map((item) => ({
                id: item.friend_user_id,
                name: item.friend_name,
                avatar: item.friend_avatar,
                status: item.friend_status || "offline",
                currentAnime: item.current_anime,
                currentEpisode: item.current_episode,
                animeId: item.current_anime_ref_id,
                animeBackground: item.current_anime_image,
                lastSeen: item.last_seen,
                friendshipId: item.friendship_id,
                friendshipStatus: item.friendship_status,
                friendsSince: item.friends_since,
            }))
        } catch (err) {
            error.value = errorMessage(err, "Failed to fetch friends")
            console.error("Error fetching friends:", err)
        } finally {
            loading.value = false
        }
    }

    // Fetch blocked users (batched — single lookup for all blocked IDs instead of one query per user)
    const fetchBlockedUsers = async () => {
        if (!userIdRef.value) return []

        try {
            const { data, error: fetchError } = await supabase
                .from("friends")
                .select("id, user_id, friend_id, created_at")
                .eq("status", "blocked")
                .eq("requester_id", userIdRef.value) // Only show users YOU blocked

            if (fetchError) throw fetchError
            if (!data?.length) return []

            const blockedUserIds = data.map((b) => (b.user_id === userIdRef.value ? b.friend_id : b.user_id))

            const { data: users } = await supabase.from("users").select("id, name, avatar").in("id", blockedUserIds)
            const userById = new Map((users || []).map((u) => [u.id, u]))

            // Fallback to auth.users (via RPC) only for the ones missing from `users`
            const missingIds = blockedUserIds.filter((id) => !userById.has(id))
            if (missingIds.length) {
                await Promise.all(
                    missingIds.map(async (id) => {
                        const { data: authUser } = await supabase.rpc("get_user_info", { user_id: id })
                        if (authUser?.[0]) userById.set(id, authUser[0])
                    })
                )
            }

            return data.map((block) => {
                const blockedUserId = block.user_id === userIdRef.value ? block.friend_id : block.user_id
                const user = userById.get(blockedUserId)
                return {
                    id: blockedUserId,
                    name: user?.name || "Unknown User",
                    avatar: user?.avatar || null,
                    friendshipId: block.id,
                    blockedAt: block.created_at,
                }
            })
        } catch (err) {
            console.error("Error fetching blocked users:", err)
            error.value = errorMessage(err, "Failed to fetch blocked users")
            return []
        }
    }

    // Fetch pending friend requests using RPC function
    const fetchPendingRequests = async () => {
        if (!userIdRef.value) {
            pendingRequests.value = []
            return
        }

        try {
            const { data, error: fetchError } = await supabase.rpc("get_pending_requests")
            if (fetchError) throw fetchError

            // RPC fields already match the shape we need — no transform necessary
            pendingRequests.value = data || []
        } catch (err) {
            console.error("Error fetching pending requests:", err)
            error.value = errorMessage(err, "Failed to fetch pending requests")
        }
    }

    // Search users using RPC function
    const searchUsers = async (searchQuery) => {
        if (!searchQuery || searchQuery.length < 2) {
            return []
        }

        try {
            const { data, error: searchError } = await supabase.rpc("search_users", {
                search_query: searchQuery,
            })

            if (searchError) throw searchError

            return data || []
        } catch (err) {
            console.error("Error searching users:", err)
            error.value = errorMessage(err, "Failed to search users")
            return []
        }
    }

    // Send a friend request
    const sendFriendRequest = async (targetUserId) => {
        if (!userIdRef.value || userIdRef.value === targetUserId) {
            error.value = "Invalid friend request"
            return false
        }

        try {
            error.value = null
            const [id1, id2] = sortedPair(userIdRef.value, targetUserId)

            const { error: insertError } = await supabase.from("friends").insert({
                user_id: id1,
                friend_id: id2,
                status: "pending",
                requester_id: userIdRef.value,
            })

            if (insertError) throw insertError

            await fetchFriends()
            return true
        } catch (err) {
            error.value = errorMessage(err, "Failed to send friend request")
            console.error("Error sending friend request:", err)
            return false
        }
    }

    // Accept a friend request
    const acceptFriendRequest = async (friendshipId) => {
        try {
            error.value = null

            const { error: updateError } = await supabase
                .from("friends")
                .update({
                    status: "accepted",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", friendshipId)

            if (updateError) throw updateError

            await Promise.all([fetchPendingRequests(), fetchFriends()])
            return true
        } catch (err) {
            error.value = errorMessage(err, "Failed to accept friend request")
            console.error("Error accepting friend request:", err)
            return false
        }
    }

    // Reject a friend request
    const rejectFriendRequest = async (friendshipId) => {
        try {
            error.value = null

            // Delete rejected requests instead of updating
            const { error: deleteError } = await supabase.from("friends").delete().eq("id", friendshipId)

            if (deleteError) throw deleteError

            await fetchPendingRequests()
            return true
        } catch (err) {
            error.value = errorMessage(err, "Failed to reject friend request")
            console.error("Error rejecting friend request:", err)
            return false
        }
    }

    // Block a user
    const blockUser = async (targetUserId) => {
        if (!userIdRef.value) return false

        try {
            error.value = null
            const [id1, id2] = sortedPair(userIdRef.value, targetUserId)

            const { data: existing } = await supabase.from("friends").select("id").eq("user_id", id1).eq("friend_id", id2).maybeSingle()

            if (existing) {
                const { error: updateError } = await supabase
                    .from("friends")
                    .update({
                        status: "blocked",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", existing.id)

                if (updateError) throw updateError
            } else {
                const { error: insertError } = await supabase.from("friends").insert({
                    user_id: id1,
                    friend_id: id2,
                    status: "blocked",
                    requester_id: userIdRef.value,
                })

                if (insertError) throw insertError
            }

            await fetchFriends()
            return true
        } catch (err) {
            error.value = errorMessage(err, "Failed to block user")
            console.error("Error blocking user:", err)
            return false
        }
    }

    // Unblock a user
    const unblockUser = async (targetUserId) => {
        if (!userIdRef.value) return false

        try {
            error.value = null
            const [id1, id2] = sortedPair(userIdRef.value, targetUserId)

            const { error: deleteError } = await supabase.from("friends").delete().eq("user_id", id1).eq("friend_id", id2).eq("status", "blocked")

            if (deleteError) throw deleteError

            await fetchFriends()
            return true
        } catch (err) {
            error.value = errorMessage(err, "Failed to unblock user")
            console.error("Error unblocking user:", err)
            return false
        }
    }

    // Remove a friend
    const removeFriend = async (friendshipId) => {
        try {
            error.value = null

            const { error: deleteError } = await supabase.from("friends").delete().eq("id", friendshipId)

            if (deleteError) throw deleteError

            await fetchFriends()
            return true
        } catch (err) {
            error.value = errorMessage(err, "Failed to remove friend")
            console.error("Error removing friend:", err)
            return false
        }
    }

    // Subscribe to real-time friend updates.
    // Realtime's postgres_changes filter can't express OR across two columns
    // (user_id=eq.X OR friend_id=eq.X isn't valid filter syntax), so instead
    // we register two filtered subscriptions on the same channel — each one
    // narrows server-side on its own, so we're not asking the client to
    // silently re-filter every friendship row in the whole table.
    const subscribeToFriendUpdates = () => {
        if (!userIdRef.value) return

        if (globalState.friendsChannel) {
            supabase.removeChannel(globalState.friendsChannel)
        }

        const onChange = () => Promise.all([fetchFriends(), fetchPendingRequests()])

        globalState.friendsChannel = supabase
            .channel(`friends:${userIdRef.value}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${userIdRef.value}` }, onChange)
            .on("postgres_changes", { event: "*", schema: "public", table: "friends", filter: `friend_id=eq.${userIdRef.value}` }, onChange)
            .subscribe()
    }

    // Subscribe to user status changes, scoped server-side to just your friends
    // via the `in` filter (Realtime caps this at 100 values).
    const subscribeToStatusUpdates = () => {
        if (!userIdRef.value) return

        const friendIds = friends.value.map((f) => f.id).sort()
        const idsKey = friendIds.join(",")

        // Every component using this composable runs its own copy of the
        // friends-list watcher below; skip rebuilding the channel if the
        // friend set hasn't actually changed since we last built it.
        if (idsKey === globalState.statusFriendIds) return
        globalState.statusFriendIds = idsKey

        if (globalState.statusChannel) {
            supabase.removeChannel(globalState.statusChannel)
            globalState.statusChannel = null
        }

        if (friendIds.length === 0) return

        const handleStatusUpdate = (payload) => {
            const updatedStatus = payload.new

            const friendIndex = friends.value.findIndex((f) => f.id === updatedStatus.user_id)
            if (friendIndex === -1) return

            // Create a new object (and use splice) to trigger reactivity
            friends.value.splice(friendIndex, 1, {
                ...friends.value[friendIndex],
                status: updatedStatus.status || "offline",
                currentAnime: updatedStatus.anime_title || null,
                currentEpisode: updatedStatus.episode_number || null,
                animeId: updatedStatus.anime_ref_id || null,
                animeBackground: updatedStatus.anime_image || null,
                lastSeen: updatedStatus.last_seen || new Date().toISOString(),
            })
        }

        const filter = `user_id=in.(${friendIds.slice(0, 100).join(",")})`

        globalState.statusChannel = supabase
            .channel(`friend_status:${userIdRef.value}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_status", filter }, handleStatusUpdate)
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_status", filter }, handleStatusUpdate)
            .subscribe((status) => {
                if (status === "CHANNEL_ERROR") {
                    console.error("Error subscribing to user_status table")
                }
            })
    }

    // Unsubscribe from all updates
    const unsubscribe = () => {
        if (globalState.friendsChannel) {
            supabase.removeChannel(globalState.friendsChannel)
            globalState.friendsChannel = null
        }
        if (globalState.statusChannel) {
            supabase.removeChannel(globalState.statusChannel)
            globalState.statusChannel = null
        }
        globalState.statusFriendIds = null
    }

    // Supabase may restore the socket after tab sleep but not re-join channels —
    // remove + subscribe again, then refetch so FriendList catches missed status.
    const recoverRealtime = async () => {
        if (!globalState.initialized || !userIdRef.value || globalState.recovering) return
        globalState.recovering = true
        try {
            unsubscribe()
            await Promise.all([fetchFriends(), fetchPendingRequests()])
            subscribeToFriendUpdates()
            subscribeToStatusUpdates()
        } catch (err) {
            console.error('Error recovering friends realtime:', err)
        } finally {
            globalState.recovering = false
        }
    }
    globalState.recover = recoverRealtime

    if (import.meta.client && !globalState.resumeBound) {
        globalState.resumeBound = true
        let resumeTimer = null
        const scheduleRecover = () => {
            clearTimeout(resumeTimer)
            resumeTimer = setTimeout(() => globalState.recover?.(), 300)
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') scheduleRecover()
        })
        window.addEventListener('online', scheduleRecover)
    }

    // Watch for userId changes - only initialize once per user
    watch(
        userIdRef,
        async (newUserId, oldUserId) => {
            if (newUserId && newUserId !== oldUserId) {
                if (!globalState.initialized || globalState.currentUserId.value !== newUserId) {
                    globalState.currentUserId.value = newUserId
                    globalState.initialized = true
                    unsubscribe()
                    await Promise.all([fetchFriends(), fetchPendingRequests()])
                    subscribeToFriendUpdates()
                    subscribeToStatusUpdates()
                }
            } else if (!newUserId) {
                unsubscribe()
                friends.value = []
                pendingRequests.value = []
                globalState.initialized = false
                globalState.currentUserId.value = null
                globalState.recover = null
            }
        },
        { immediate: true }
    )

    // Watch friends list changes to resubscribe with updated filter
    watch(
        () => friends.value.map((f) => f.id).join(","),
        (newFriendIds, oldFriendIds) => {
            // Only resubscribe if friends list actually changed and we're initialized
            if (globalState.initialized && newFriendIds !== oldFriendIds && userIdRef.value) {
                subscribeToStatusUpdates()
            }
        }
    )

    return {
        friends: readonly(friends),
        pendingRequests: readonly(pendingRequests),
        loading: readonly(loading),
        error: readonly(error),
        fetchFriends,
        fetchPendingRequests,
        fetchBlockedUsers,
        searchUsers,
        sendFriendRequest,
        acceptFriendRequest,
        rejectFriendRequest,
        blockUser,
        unblockUser,
        removeFriend,
        refresh: async () => {
            await Promise.all([fetchFriends(), fetchPendingRequests()])
        },
        unsubscribe,
    }
}