/**
 * Anime-meta admin page state, search/list/editor actions, and field-visibility prefs.
 * Used by AdminPage; keep useAdmin.js limited to role/session checks.
 */
export function useAdminPage() {
    const appConfig = useAppConfig()
    const route = useRoute()

    const loading = ref(false)
    const saving = ref(false)
    const autofilling = ref(false)
    const errorMessage = ref('')

    const records = ref([])
    const fields = ref([])
    const formSections = ref([])
    const videoSources = ref([])
    const defaultVideoSource = ref('')

    const selectedRecord = ref(null)
    const editableRecord = ref(null)

    const searchField = ref('')
    const searchValue = ref('')
    const searchOperator = ref('like')
    const sortOrder = ref('desc')

    const searchOperatorOptions = [
        { value: 'like', label: '包含 (LIKE)' },
        { value: 'eq', label: '等於 (=)' },
        { value: 'gte', label: '大於等於 (>=)' },
        { value: 'lte', label: '小於等於 (<=)' },
        { value: 'neq', label: '不等於 (≠)' },
        { value: 'in', label: '在列表中 (IN，逗號分隔)' },
    ]

    const sortOrderOptions = [
        { value: 'asc', label: '升序 (A-Z)' },
        { value: 'desc', label: '降序 (Z-A)' },
    ]

    const page = ref(1)
    const pageSize = ref(50)
    const total = ref(0)

    const isCreating = ref(false)
    const showUnsavedModal = ref(false)
    const showFieldSettings = ref(false)
    const baselineSnapshot = ref('')
    let pendingAction = null

    const HIDDEN_FIELDS_KEY = 'admin-anime-meta-hidden-fields'
    const SECTION_ORDER_KEY = 'admin-anime-meta-section-order'

    /** Field names currently hidden from the editor form (persisted in localStorage). */
    const hiddenFields = reactive(new Set())
    const sectionOrder = ref([])
    if (import.meta.client) {
        try {
            for (const name of JSON.parse(localStorage.getItem(HIDDEN_FIELDS_KEY) || '[]')) {
                hiddenFields.add(name)
            }
            sectionOrder.value = JSON.parse(localStorage.getItem(SECTION_ORDER_KEY) || '[]')
        } catch { /* ignore */ }
    }
    watch(() => [...hiddenFields], (names) => {
        if (!import.meta.client) return
        localStorage.setItem(HIDDEN_FIELDS_KEY, JSON.stringify(names))
    })
    watch(sectionOrder, (ids) => {
        if (!import.meta.client) return
        localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(ids))
    }, { deep: true })

    function toggleFieldHidden(name) {
        if (hiddenFields.has(name)) hiddenFields.delete(name)
        else hiddenFields.add(name)
    }

    /** Fill `{value}` in a server-provided action href. */
    function actionHref(action, value) {
        if (!action?.href || value == null || value === '') return undefined
        return action.href.replaceAll('{value}', encodeURIComponent(String(value)))
    }

    function hideAllFields() {
        for (const s of formSections.value) {
            for (const f of s.fields) hiddenFields.add(f.name)
        }
    }

    function orderedFormSections(sections) {
        if (!sectionOrder.value.length) return sections
        const map = new Map(sections.map((s) => [s.id, s]))
        const ordered = []
        for (const id of sectionOrder.value) {
            const s = map.get(id)
            if (s) {
                ordered.push(s)
                map.delete(id)
            }
        }
        return [...ordered, ...map.values()]
    }

    function moveSection(id, delta) {
        const ids = orderedFormSections(formSections.value).map((s) => s.id)
        const i = ids.indexOf(id)
        const j = i + delta
        if (i < 0 || j < 0 || j >= ids.length) return
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
        sectionOrder.value = ids
    }

    const settingsFormSections = computed(() => orderedFormSections(formSections.value))

    const visibleFormSections = computed(() =>
        settingsFormSections.value
            .map((s) => ({ ...s, fields: s.fields.filter((f) => !hiddenFields.has(f.name)) }))
            .filter((s) => s.fields.length),
    )

    const isEdited = computed(() => {
        if (!editableRecord.value || !baselineSnapshot.value) return false
        return JSON.stringify(editableRecord.value) !== baselineSnapshot.value
    })

    function markClean() {
        baselineSnapshot.value = editableRecord.value ? JSON.stringify(editableRecord.value) : ''
    }

    /** Broadcast season (春/夏/秋/冬) from premiere_date — matches anime1 values. */
    function seasonFromPremiereDate(dateStr) {
        if (!dateStr) return ''
        const match = String(dateStr).match(/^\d{4}-(\d{1,2})/)
        if (!match) return ''
        const month = Number(match[1])
        if (month >= 1 && month <= 3) return '冬'
        if (month >= 4 && month <= 6) return '春'
        if (month >= 7 && month <= 9) return '夏'
        if (month >= 10 && month <= 12) return '秋'
        return ''
    }

    function syncSeasonFromPremiereDate() {
        if (!editableRecord.value) return
        const season = seasonFromPremiereDate(editableRecord.value.premiere_date)
        if (season) editableRecord.value.season = season
    }

    function guard(action) {
        if (!isEdited.value) return action()
        pendingAction = action
        showUnsavedModal.value = true
    }

    function discardAndProceed() {
        showUnsavedModal.value = false
        if (baselineSnapshot.value) {
            editableRecord.value = JSON.parse(baselineSnapshot.value)
        } else {
            editableRecord.value = null
            selectedRecord.value = null
            isCreating.value = false
        }
        pendingAction?.()
        pendingAction = null
    }

    function cancelPendingAction() {
        showUnsavedModal.value = false
        pendingAction = null
    }

    function formatValueForInput(value, type) {
        if (value === null || value === undefined) {
            if (type === 'array') return []
            if (type === 'boolean') return false
            if (type === 'number' || type === 'double') return null
            return ''
        }

        switch (type) {
            case 'date':
                if (typeof value === 'string') {
                    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
                    if (dateOnlyPattern.test(value)) {
                        return value
                    }
                    const date = parseTimestamp(value)
                    if (!isNaN(date.getTime())) {
                        const month = String(date.getMonth() + 1).padStart(2, '0')
                        const day = String(date.getDate()).padStart(2, '0')
                        return `${date.getFullYear()}-${month}-${day}`
                    }
                }
                return ''
            case 'datetime':
                if (typeof value === 'string') {
                    const date = parseTimestamp(value)
                    if (!isNaN(date.getTime())) {
                        const month = String(date.getMonth() + 1).padStart(2, '0')
                        const day = String(date.getDate()).padStart(2, '0')
                        const hours = String(date.getHours()).padStart(2, '0')
                        const minutes = String(date.getMinutes()).padStart(2, '0')
                        return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}`
                    }
                }
                return ''
            case 'array':
                if (Array.isArray(value)) return value
                if (value === null || value === undefined) return []
                try {
                    const parsed = JSON.parse(value)
                    return Array.isArray(parsed) ? parsed : []
                } catch {
                    return []
                }
            case 'boolean':
                return Boolean(value)
            case 'double':
                if (value !== null && value !== undefined) {
                    const num = Number(value)
                    return isNaN(num) ? '' : num.toFixed(1)
                }
                return ''
            case 'number':
                return value !== null && value !== undefined ? String(value) : ''
            case 'jsonb':
                if (value === null || value === undefined) return ''
                if (typeof value === 'object') {
                    try {
                        return JSON.stringify(value, null, 2)
                    } catch {
                        return ''
                    }
                }
                if (typeof value === 'string') {
                    try {
                        const parsed = JSON.parse(value)
                        return JSON.stringify(parsed, null, 2)
                    } catch {
                        return value
                    }
                }
                return ''
            default:
                return String(value)
        }
    }

    function toEditableRecord(raw) {
        const editable = {}
        const fieldMap = new Map(fields.value.map((f) => [f.name, f]))
        for (const [key, value] of Object.entries(raw || {})) {
            const field = fieldMap.get(key)
            const type = field?.type || 'text'
            editable[key] = formatValueForInput(value, type)
        }
        return editable
    }

    async function loadRecords() {
        loading.value = true
        errorMessage.value = ''

        try {
            const query = new URLSearchParams({
                page: page.value.toString(),
                pageSize: pageSize.value.toString(),
            })

            if (searchField.value && searchValue.value) {
                query.append('field', searchField.value)
                query.append('search', searchValue.value)
                query.append('operator', searchOperator.value)
            }

            if (searchField.value) {
                query.append('orderBy', searchField.value)
                query.append('order', sortOrder.value)
            }

            const res = await $fetch(`/api/admin/anime-meta?${query.toString()}`)

            records.value = res.items || []
            fields.value = res.fields || []
            formSections.value = res.formSections || []
            total.value = res.total || records.value.length
            videoSources.value = res.videoSources || []
            defaultVideoSource.value = res.defaultVideoSource || ''

            if (!searchField.value && fields.value.length) {
                searchField.value = fields.value[0].name
            }
        } catch (err) {
            console.error('Failed to load anime_meta records:', err)
            if (err?.statusCode === 401 || err?.statusCode === 403) {
                showError(createError({ statusCode: 403, statusMessage: 'Forbidden - You don\'t have permission to access this page' }))
                return
            }
            errorMessage.value = '載入資料時發生錯誤，請稍後再試。'
        } finally {
            loading.value = false
        }
    }

    function handleSelect(record) {
        const same =
            !isCreating.value &&
            selectedRecord.value &&
            (selectedRecord.value.source_id || selectedRecord.value.id) === (record.source_id || record.id)
        if (same) return
        guard(() => {
            selectedRecord.value = record
            editableRecord.value = toEditableRecord(record)
            isCreating.value = false
            markClean()
        })
    }

    function handleCreateNew() {
        guard(() => {
            const base = {}
            for (const field of fields.value) {
                if (field.readOnly) continue
                if (field.type === 'array') {
                    base[field.name] = []
                } else if (field.type === 'jsonb') {
                    base[field.name] = {}
                } else if (field.type === 'number' || field.type === 'double') {
                    base[field.name] = null
                } else {
                    base[field.name] = ''
                }
            }
            editableRecord.value = toEditableRecord(base)
            selectedRecord.value = null
            isCreating.value = true
            markClean()
        })
    }

    async function handleAutofill() {
        const detailId = editableRecord.value?.source_details_id
        if (!detailId) {
            errorMessage.value = '請先填寫詳細資料編號（source_details_id）再自動填入。'
            return
        }

        autofilling.value = true
        errorMessage.value = ''

        try {
            const data = await $fetch(`/api/admin/anime-meta/autofill?detailId=${encodeURIComponent(detailId)}`)
            const fieldMap = new Map(fields.value.map((f) => [f.name, f]))

            for (const [key, value] of Object.entries(data || {})) {
                const field = fieldMap.get(key)
                if (!field || field.readOnly) continue
                if (key === 'source_id' && editableRecord.value.source_id && !isCreating.value) continue
                editableRecord.value[key] = formatValueForInput(value, field.type)
            }
            syncSeasonFromPremiereDate()
        } catch (err) {
            console.error('Failed to autofill anime_meta:', err)
            errorMessage.value = '自動填入失敗，請確認 source_details_id 是否正確。'
        } finally {
            autofilling.value = false
        }
    }

    async function handleSave() {
        if (!editableRecord.value) return

        saving.value = true
        errorMessage.value = ''

        try {
            const payload = { ...editableRecord.value }

            const fieldMap = new Map(fields.value.map((f) => [f.name, f]))
            for (const [key, value] of Object.entries(payload)) {
                if (fieldMap.get(key)?.type === 'jsonb' && typeof value === 'string') {
                    if (!value.trim()) {
                        payload[key] = null
                    } else {
                        try {
                            payload[key] = JSON.parse(value)
                        } catch {
                            errorMessage.value = `欄位「${fieldMap.get(key)?.label || key}」的 JSON 格式不正確，請檢查後再儲存。`
                            saving.value = false
                            return
                        }
                    }
                }
            }

            let result

            if (isCreating.value) {
                result = await $fetch('/api/admin/anime-meta', {
                    method: 'POST',
                    body: payload,
                })
            } else {
                const sourceId = selectedRecord.value?.source_id || editableRecord.value.source_id

                if (!sourceId) {
                    errorMessage.value = '缺少 source_id，無法更新資料。'
                    return
                }

                result = await $fetch(`/api/admin/anime-meta/${encodeURIComponent(sourceId)}`, {
                    method: 'PUT',
                    body: payload,
                })
            }

            if (result) {
                selectedRecord.value = result
                editableRecord.value = toEditableRecord(result)
                isCreating.value = false
            }
            markClean()
            await loadRecords()
        } catch (err) {
            console.error('Failed to save anime_meta record:', err)
            errorMessage.value = '儲存資料時發生錯誤，請確認欄位內容是否正確。'
        } finally {
            saving.value = false
        }
    }

    async function handleDelete() {
        if (!selectedRecord.value?.source_id) {
            errorMessage.value = '未選擇要刪除的紀錄。'
            return
        }

        const confirmed = window.confirm('確定要刪除此紀錄嗎？此操作無法復原。')
        if (!confirmed) return

        saving.value = true
        errorMessage.value = ''

        try {
            await $fetch(`/api/admin/anime-meta/${encodeURIComponent(selectedRecord.value.source_id)}`, {
                method: 'DELETE',
            })

            selectedRecord.value = null
            editableRecord.value = null
            isCreating.value = false
            baselineSnapshot.value = ''

            await loadRecords()
        } catch (err) {
            console.error('Failed to delete anime_meta record:', err)
            errorMessage.value = '刪除資料時發生錯誤，請稍後再試。'
        } finally {
            saving.value = false
        }
    }

    const totalPages = computed(() => {
        if (!total.value || !pageSize.value) return 1
        return Math.max(1, Math.ceil(total.value / pageSize.value))
    })

    const searchFieldOptions = computed(() =>
        fields.value.map((f) => ({ value: f.name, label: f.label || f.name })),
    )

    function changePage(newPage) {
        if (newPage < 1 || newPage > totalPages.value) return
        page.value = newPage
        loadRecords()
    }

    function applySearch() {
        guard(() => {
            page.value = 1
            loadRecords()
        })
    }

    function resetSearch() {
        guard(() => {
            searchValue.value = ''
            page.value = 1
            loadRecords()
        })
    }

    watch(sortOrder, () => {
        if (searchField.value) {
            page.value = 1
            loadRecords()
        }
    })

    useHead({
        title: `管理後台 | ${appConfig.siteName}`,
    })

    onMounted(() => {
        const q = route.query
        if (q.field && q.search !== undefined && String(q.search).length > 0) {
            searchField.value = String(q.field)
            searchValue.value = String(q.search)
            if (q.operator) searchOperator.value = String(q.operator)
        }
        loadRecords()
    })

    return {
        loading,
        saving,
        autofilling,
        errorMessage,
        records,
        videoSources,
        defaultVideoSource,
        selectedRecord,
        editableRecord,
        searchField,
        searchValue,
        searchOperator,
        sortOrder,
        searchOperatorOptions,
        sortOrderOptions,
        page,
        total,
        isCreating,
        showUnsavedModal,
        showFieldSettings,
        hiddenFields,
        settingsFormSections,
        visibleFormSections,
        searchFieldOptions,
        totalPages,
        toggleFieldHidden,
        hideAllFields,
        actionHref,
        moveSection,
        syncSeasonFromPremiereDate,
        discardAndProceed,
        cancelPendingAction,
        handleSelect,
        handleCreateNew,
        handleAutofill,
        handleSave,
        handleDelete,
        changePage,
        applySearch,
        resetSearch,
    }
}
