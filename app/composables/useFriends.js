// Global shared state (singleton pattern)
const globalState = {
    friends: ref([]),
    pendingRequests: ref([]),
    loading: ref(false),
    error: ref(null),
    currentUserId: ref(null),
    friendsChannel: null,
    statusChannel: null,
    initialized: false,
}

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
            error.value = err instanceof Error ? err.message : "Failed to fetch friends"
            console.error("Error fetching friends:", err)
        } finally {
            loading.value = false
        }
    }

    // Fetch blocked users
    const fetchBlockedUsers = async () => {
        if (!userIdRef.value) {
            return []
        }

        try {
            const { data, error: fetchError } = await supabase
                .from("friends")
                .select(
                    `
                    id,
                    user_id,
                    friend_id,
                    requester_id,
                    created_at
                `
                )
                .eq("status", "blocked")
                .or(`user_id.eq.${userIdRef.value},friend_id.eq.${userIdRef.value}`)
                .eq("requester_id", userIdRef.value) // Only show users YOU blocked

            if (fetchError) throw fetchError

            // Fetch user info for each blocked user
            const blockedUsersWithInfo = await Promise.all(
                (data || []).map(async (block) => {
                    const blockedUserId = block.user_id === userIdRef.value ? block.friend_id : block.user_id

                    const { data: userData } = await supabase.from("users").select("id, name, avatar").eq("id", blockedUserId).single()

                    // Fallback: get from auth.users if not in users table
                    if (!userData) {
                        const { data: authUser } = await supabase.rpc("get_user_info", { user_id: blockedUserId })
                        if (authUser && authUser.length > 0) {
                            return {
                                id: authUser[0].id,
                                name: authUser[0].name,
                                avatar: authUser[0].avatar,
                                friendshipId: block.id,
                                blockedAt: block.created_at,
                            }
                        }
                    }

                    return {
                        id: blockedUserId,
                        name: userData?.name || "Unknown User",
                        avatar: userData?.avatar || null,
                        friendshipId: block.id,
                        blockedAt: block.created_at,
                    }
                })
            )

            return blockedUsersWithInfo
        } catch (err) {
            console.error("Error fetching blocked users:", err)
            error.value = err instanceof Error ? err.message : "Failed to fetch blocked users"
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

            pendingRequests.value = (data || []).map((req) => ({
                id: req.id,
                user_id: req.user_id,
                friend_id: req.friend_id,
                requester_id: req.requester_id,
                created_at: req.created_at,
                sender_name: req.sender_name,
                sender_avatar: req.sender_avatar,
                receiver_name: req.receiver_name,
                receiver_avatar: req.receiver_avatar,
            }))
        } catch (err) {
            console.error("Error fetching pending requests:", err)
            error.value = err instanceof Error ? err.message : "Failed to fetch pending requests"
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
            error.value = err instanceof Error ? err.message : "Failed to search users"
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
            const [id1, id2] = [userIdRef.value, targetUserId].sort()

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
            error.value = err instanceof Error ? err.message : "Failed to send friend request"
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
            error.value = err instanceof Error ? err.message : "Failed to accept friend request"
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
            error.value = err instanceof Error ? err.message : "Failed to reject friend request"
            console.error("Error rejecting friend request:", err)
            return false
        }
    }

    // Block a user
    const blockUser = async (targetUserId) => {
        if (!userIdRef.value) return false

        try {
            error.value = null
            const [id1, id2] = [userIdRef.value, targetUserId].sort()

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
            error.value = err instanceof Error ? err.message : "Failed to block user"
            console.error("Error blocking user:", err)
            return false
        }
    }

    // Unblock a user
    const unblockUser = async (targetUserId) => {
        if (!userIdRef.value) return false

        try {
            error.value = null
            const [id1, id2] = [userIdRef.value, targetUserId].sort()

            const { error: deleteError } = await supabase.from("friends").delete().eq("user_id", id1).eq("friend_id", id2).eq("status", "blocked")

            if (deleteError) throw deleteError

            await fetchFriends()
            return true
        } catch (err) {
            error.value = err instanceof Error ? err.message : "Failed to unblock user"
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
            error.value = err instanceof Error ? err.message : "Failed to remove friend"
            console.error("Error removing friend:", err)
            return false
        }
    }

    // Subscribe to real-time friend updates
    const subscribeToFriendUpdates = () => {
        if (!userIdRef.value) return

        // Clean up existing subscription
        if (globalState.friendsChannel) {
            supabase.removeChannel(globalState.friendsChannel)
        }

        globalState.friendsChannel = supabase
            .channel(`friends:${userIdRef.value}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "friends",
                    filter: `or(user_id.eq.${userIdRef.value},friend_id.eq.${userIdRef.value})`,
                },
                async (payload) => {
                    await Promise.all([fetchFriends(), fetchPendingRequests()])
                }
            )
            .subscribe()
    }

    // Subscribe to user status changes
    const subscribeToStatusUpdates = () => {
        if (!userIdRef.value) return

        // Clean up existing subscription
        if (globalState.statusChannel) {
            supabase.removeChannel(globalState.statusChannel)
        }

        // Get list of friend IDs to filter subscriptions
        const friendIds = friends.value.map((f) => f.id)

        if (friendIds.length === 0) return

        const handleStatusUpdate = (payload) => {
            const updatedStatus = payload.new

            // Double-check it's not the user themselves (shouldn't happen with filter, but just in case)
            if (updatedStatus.user_id === userIdRef.value) {
                return
            }
            // Update specific friend status without refetching all
            const friendIndex = friends.value.findIndex((f) => f.id === updatedStatus.user_id)

            if (friendIndex !== -1) {
                // Create a new object to trigger reactivity
                const updatedFriend = {
                    ...friends.value[friendIndex],
                    status: updatedStatus.status || "offline",
                    currentAnime: updatedStatus.anime_title || null,
                    currentEpisode: updatedStatus.episode_number || null,
                    animeId: updatedStatus.anime_ref_id || null,
                    animeBackground: updatedStatus.anime_image || null,
                    lastSeen: updatedStatus.last_seen || new Date().toISOString(),
                }

                // Use splice to trigger reactivity
                friends.value.splice(friendIndex, 1, updatedFriend)
            }
        }

        const filterString = friendIds.map((id) => `user_id.eq.${id}`).join(",")

        globalState.statusChannel = supabase
            .channel("user_status_updates")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "user_status",
                    // filter: `or(${filterString})`
                },
                handleStatusUpdate
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "user_status",
                    // filter: `or(${filterString})`
                },
                handleStatusUpdate
            )
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
