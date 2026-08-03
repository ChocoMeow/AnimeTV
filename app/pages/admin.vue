<script setup>
import { DEFAULT_VIDEO_SOURCE, VIDEO_SOURCES } from '~~/shared/videoSources'

const appConfig = useAppConfig()
const route = useRoute()

const loading = ref(false)
const saving = ref(false)
const autofilling = ref(false)
const errorMessage = ref('')

const records = ref([])
const fields = ref([])
const formSections = ref([])

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

/** Field names currently hidden from the editor form (session only). */
const hiddenFields = reactive(new Set())

function toggleFieldHidden(name) {
    if (hiddenFields.has(name)) hiddenFields.delete(name)
    else hiddenFields.add(name)
}

function hideAllFields() {
    for (const s of formSections.value) {
        for (const f of s.fields) hiddenFields.add(f.name)
    }
}

const visibleFormSections = computed(() =>
    formSections.value
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

// Field labels are now provided by backend in fields array

function formatValueForInput(value, type) {
    if (value === null || value === undefined) {
        // Return appropriate default based on type
        if (type === 'array') return []
        if (type === 'boolean') return false
        if (type === 'number' || type === 'double') return null
        return ''
    }
    
    switch (type) {
        case 'date':
            if (typeof value === 'string') {
                // Handle both date-only and datetime strings, return YYYY-MM-DD for input[type="date"]
                const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/
                if (dateOnlyPattern.test(value)) {
                    return value
                }
                const date = new Date(value)
                if (!isNaN(date.getTime())) {
                    return date.toISOString().slice(0, 10)
                }
            }
            return ''
        case 'datetime':
            if (typeof value === 'string') {
                const date = new Date(value)
                if (!isNaN(date.getTime())) {
                    return date.toISOString().slice(0, 16)
                }
            }
            return ''
        case 'array':
            // Convert null/undefined to empty array for display, empty array stays as is
            if (Array.isArray(value)) return value
            if (value === null || value === undefined) return []
            // Try to parse string as array
            try {
                const parsed = JSON.parse(value)
                return Array.isArray(parsed) ? parsed : []
            } catch {
                return []
            }
        case 'boolean':
            return Boolean(value)
        case 'double':
            // Format to 1 decimal place
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
    // Use fields from backend to get types
    const fieldMap = new Map(fields.value.map(f => [f.name, f]))
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
        
        // Add sort order if search field is selected (works even without search value)
        if (searchField.value) {
            query.append('orderBy', searchField.value)
            query.append('order', sortOrder.value)
        }

        const res = await $fetch(`/api/admin/anime-meta?${query.toString()}`)

        records.value = res.items || []
        fields.value = res.fields || []
        formSections.value = res.formSections || []
        total.value = res.total || records.value.length

        // Initialize default search field, but
        // do NOT auto-select any record in the editor.
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
            // Keep existing source_id when editing a record
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

        // Parse jsonb fields from textarea string back to object for API
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

// Search field dropdown options with labels
const searchFieldOptions = computed(() =>
    fields.value.map((f) => ({ value: f.name, label: f.label || f.name }))
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

// Watch sortOrder changes to reload records
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

// chip input logic moved into reusable ChipInput component
</script>

<template>
    <div class="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
            <div>
                <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">動畫資料管理</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    僅限擁有管理員身份的使用者，可以在此頁面管理動畫資料表。
                </p>
            </div>
        </div>

        <!-- Main Content -->
        <div
            class="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.7fr)] gap-6"
        >
            <!-- Left Panel: List & Search -->
            <div class="space-y-4">
                <!-- Search Card -->
                <div class="admin-panel">
                    <div class="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-rounded text-base text-gray-500 dark:text-gray-400">search</span>
                            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">搜尋與篩選</h2>
                        </div>
                    </div>
                    <div class="px-4 py-3 space-y-3">
                        <div class="flex flex-col gap-2">
                            <label class="text-xs font-medium text-gray-600 dark:text-gray-300">搜尋欄位</label>
                            <Dropdown
                                v-model="searchField"
                                :options="searchFieldOptions"
                                placeholder="請選擇搜尋欄位"
                            />
                        </div>

                        <div class="flex flex-col gap-2">
                            <label class="text-xs font-medium text-gray-600 dark:text-gray-300">運算符</label>
                            <Dropdown
                                v-model="searchOperator"
                                :options="searchOperatorOptions"
                                placeholder="請選擇"
                            />
                        </div>

                        <div class="flex flex-col gap-2">
                            <label class="text-xs font-medium text-gray-600 dark:text-gray-300">排序</label>
                            <Dropdown
                                v-model="sortOrder"
                                :options="sortOrderOptions"
                                placeholder="請選擇排序方式"
                                :disabled="!searchField"
                            />
                        </div>

                        <div class="flex flex-col gap-2">
                            <label class="text-xs font-medium text-gray-600 dark:text-gray-300">關鍵字</label>
                            <input
                                v-model="searchValue"
                                type="text"
                                :placeholder="searchOperator === 'in' ? '多個值請用逗號分隔' : '輸入欄位值進行搜尋'"
                                class="admin-input"
                                @keyup.enter="applySearch"
                            />
                        </div>

                        <div class="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                class="btn-admin-ghost"
                                @click="resetSearch"
                            >
                                重設
                            </button>
                            <button
                                type="button"
                                class="btn-admin-primary"
                                @click="applySearch"
                            >
                                <span class="material-symbols-rounded text-xs">search</span>
                                套用搜尋
                            </button>
                        </div>
                    </div>
                </div>

                <!-- List Card -->
                <div class="admin-panel flex flex-col max-h-[600px]">
                    <div class="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-rounded text-base text-gray-500 dark:text-gray-400">view_list</span>
                            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">紀錄列表</h2>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                            共 {{ total }} 部
                        </span>
                    </div>
                    <div class="flex-1 overflow-auto">
                        <div v-if="loading" class="flex items-center justify-center py-10">
                            <div class="animate-spin rounded-full h-10 w-10 border-4 border-black/10 dark:border-white/15 border-t-gray-900 dark:border-t-white"></div>
                        </div>

                        <div v-else-if="!records.length" class="py-8 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                            目前沒有任何紀錄，請點選右上方「新增紀錄」建立。
                        </div>

                        <ul v-else class="divide-y divide-black/5 dark:divide-white/5">
                            <li
                                v-for="record in records"
                                :key="record.source_id || record.id"
                                :class="[
                                    'px-4 py-3 cursor-pointer transition-colors flex items-center gap-3',
                                    selectedRecord && (selectedRecord.source_id || selectedRecord.id) === (record.source_id || record.id)
                                        ? 'bg-black/5 dark:bg-white/10'
                                        : 'hover:bg-black/[0.03] dark:hover:bg-white/5',
                                ]"
                                @click="handleSelect(record)"
                            >
                                <!-- Thumbnail -->
                                <div class="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/5">
                                    <NuxtImg
                                        v-if="record.thumbnail"
                                        :src="record.thumbnail"
                                        :alt="record.title || record.source_id || 'anime thumbnail'"
                                        class="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                    <div
                                        v-else
                                        class="w-full h-full flex items-center justify-center text-[10px] text-gray-400 dark:text-gray-500"
                                    >
                                        無封面
                                    </div>
                                </div>

                                <!-- Text info -->
                                <div class="flex flex-col gap-0.5 min-w-0">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {{ record.title || '(未設定標題)' }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        外部編號：{{ record.source_id || record.id || '—' }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        片源：{{ record.video_source || DEFAULT_VIDEO_SOURCE }} · ID：{{ record.video_id || '未綁定' }} · 季數：{{ record.season || '—' }}
                                    </p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <!-- Simple Pagination -->
                    <div
                        v-if="totalPages > 1"
                        class="px-4 py-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                    >
                        <span> 第 {{ page }} / {{ totalPages }} 頁 </span>
                        <div class="flex items-center gap-2">
                            <button
                                type="button"
                                class="px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                                :disabled="page <= 1"
                                @click="changePage(page - 1)"
                            >
                                上一頁
                            </button>
                            <button
                                type="button"
                                class="px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                                :disabled="page >= totalPages"
                                @click="changePage(page + 1)"
                            >
                                下一頁
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Panel: Editor -->
            <div class="admin-panel flex flex-col">
                <div class="px-4 py-3 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-rounded text-base text-gray-500 dark:text-gray-400">edit</span>
                        <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {{ isCreating ? "新增紀錄" : "編輯紀錄" }}
                        </h2>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            class="btn-admin-ghost inline-flex items-center gap-2"
                            title="欄位設定"
                            @click="showFieldSettings = true"
                        >
                            <span class="material-symbols-rounded text-base">settings</span>
                            <span class="hidden sm:inline">欄位設定</span>
                        </button>
                        <button
                            type="button"
                            class="btn-admin-ghost inline-flex items-center gap-2"
                            @click="handleCreateNew"
                        >
                            <span class="material-symbols-rounded text-base">add</span>
                            <span class="hidden sm:inline">新增紀錄</span>
                        </button>
                        <NuxtLink
                            v-if="selectedRecord?.source_id"
                            :to="`/anime/${selectedRecord.source_id}`"
                            target="_blank"
                            class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                        >
                            <span class="material-symbols-rounded text-base">open_in_new</span>
                            <span class="hidden sm:inline">查看動漫</span>
                        </NuxtLink>
                    </div>
                </div>

                <div class="px-4 py-4 space-y-4">
                    <div v-if="errorMessage" class="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                        {{ errorMessage }}
                    </div>

                    <div v-if="!editableRecord" class="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                        請從左側列表選擇一筆紀錄，或點選「新增紀錄」開始編輯。
                    </div>

                    <!-- Thumbnail preview -->
                    <div
                        v-else
                        class="space-y-4"
                    >
                        <div class="flex items-start gap-4">
                            <div class="w-32 h-44 rounded-xl overflow-hidden bg-gray-100 dark:bg-white/5 flex-shrink-0">
                                <NuxtImg
                                    v-if="editableRecord.thumbnail"
                                    :src="editableRecord.thumbnail"
                                    :alt="editableRecord.title || editableRecord.source_id || 'thumbnail preview'"
                                    class="w-full h-full object-cover"
                                    loading="lazy"
                                />
                                <div
                                    v-else
                                    class="w-full h-full flex flex-col items-center justify-center text-xs text-gray-400 dark:text-gray-500 px-2 text-center"
                                >
                                    無封面預覽
                                </div>
                            </div>
                            <div class="flex-1 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                <p class="font-medium text-gray-700 dark:text-gray-200">封面預覽</p>
                                <p>編輯下方「封面圖片連結」欄位後，儲存前亦會即時更新預覽。</p>
                            </div>
                        </div>

                        <form
                            class="space-y-8"
                            @submit.prevent="handleSave"
                        >
                            <section
                                v-for="section in visibleFormSections"
                                :key="section.id"
                                class="space-y-3"
                            >
                                <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100 border-b border-black/5 dark:border-white/10 pb-2">
                                    {{ section.title }}
                                </h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div
                                        v-for="field in section.fields"
                                        :key="field.name"
                                        class="space-y-1.5"
                                        :class="{ 'md:col-span-2': field.wide }"
                                    >
                                    <label class="text-xs font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1">
                                        <span>{{ field.label }}</span>
                                        <span
                                            v-if="field.isPrimaryKey"
                                            class="px-1.5 py-0.5 rounded-full bg-black/80 dark:bg-white text-white dark:text-black text-[10px] font-semibold"
                                        >
                                            主鍵
                                        </span>
                                        <span
                                            v-else-if="field.readOnly"
                                            class="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-[10px] text-gray-600 dark:text-gray-300"
                                        >
                                            只讀
                                        </span>
                                    </label>

                                    <!-- Array fields (chip input) -->
                                    <div v-if="field.type === 'array'">
                                        <ChipInput
                                            v-model="editableRecord[field.name]"
                                            placeholder="輸入值後按空白或 Enter"
                                            hint="會儲存為陣列格式"
                                        />
                                    </div>

                                    <!-- source_details_id with autofill -->
                                    <div v-else-if="field.name === 'source_details_id'" class="flex gap-2">
                                        <input
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="text"
                                            class="admin-input min-w-0 flex-1"
                                        />
                                        <button
                                            type="button"
                                            class="inline-flex items-center justify-center h-[42px] px-4 rounded-full bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/10 dark:hover:bg-white/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                                            title="自動填入"
                                            :disabled="autofilling || !editableRecord.source_details_id"
                                            @click="handleAutofill"
                                        >
                                            <span
                                                class="material-symbols-rounded text-xl"
                                                :class="autofilling ? 'animate-spin' : ''"
                                            >
                                                {{ autofilling ? 'progress_activity' : 'auto_fix' }}
                                            </span>
                                        </button>
                                    </div>

                                    <!-- video_source enum -->
                                    <div v-else-if="field.name === 'video_source'">
                                        <Dropdown
                                            v-model="editableRecord[field.name]"
                                            :options="VIDEO_SOURCES"
                                            placeholder="選擇片源"
                                        />
                                    </div>

                                    <!-- Number fields -->
                                    <div v-else-if="field.type === 'number'" class="relative">
                                        <input
                                            v-model.number="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="number"
                                            step="1"
                                            class="admin-input [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                    </div>

                                    <!-- Double/Decimal fields -->
                                    <div v-else-if="field.type === 'double'" class="relative">
                                        <input
                                            :value="editableRecord[field.name]"
                                            @input="editableRecord[field.name] = $event.target.value === '' ? null : parseFloat(parseFloat($event.target.value).toFixed(1))"
                                            :readonly="field.readOnly"
                                            type="number"
                                            step="0.1"
                                            class="admin-input [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                    </div>

                                    <!-- Date fields -->
                                    <div v-else-if="field.type === 'date'" class="relative">
                                        <input
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="date"
                                            class="admin-input [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:dark:invert"
                                            @change="field.name === 'premiere_date' && syncSeasonFromPremiereDate()"
                                        />
                                    </div>

                                    <!-- Datetime fields -->
                                    <div v-else-if="field.type === 'datetime'" class="relative">
                                        <input
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="datetime-local"
                                            class="admin-input [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:dark:invert"
                                        />
                                    </div>

                                    <!-- Boolean fields -->
                                    <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2">
                                        <input
                                            :id="`checkbox-${field.name}`"
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="checkbox"
                                            class="w-4 h-4 rounded border-black/20 dark:border-white/20 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 disabled:opacity-60"
                                        />
                                        <label :for="`checkbox-${field.name}`" class="text-sm text-gray-700 dark:text-gray-300">
                                            {{ editableRecord[field.name] ? '是' : '否' }}
                                        </label>
                                    </div>

                                    <!-- Textbox fields (textarea) -->
                                    <textarea
                                        v-else-if="field.type === 'textbox'"
                                        v-model="editableRecord[field.name]"
                                        :readonly="field.readOnly"
                                        rows="2"
                                        class="admin-textarea"
                                    />

                                    <!-- JSONB fields (editable JSON textarea, saved as object) -->
                                    <textarea
                                        v-else-if="field.type === 'jsonb'"
                                        v-model="editableRecord[field.name]"
                                        :readonly="field.readOnly"
                                        rows="2"
                                        placeholder="{}"
                                        class="admin-textarea font-mono"
                                    />

                                    <!-- Text fields (default) -->
                                    <input
                                        v-else
                                        v-model="editableRecord[field.name]"
                                        :readonly="field.readOnly"
                                        type="text"
                                        class="admin-input"
                                    />
                                    </div>
                                </div>
                            </section>
                        </form>

                        <!-- Action Buttons at Bottom -->
                        <div v-if="editableRecord" class="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-black/5 dark:border-white/10">
                            <button
                                v-if="selectedRecord"
                                type="button"
                                class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                :disabled="saving"
                                @click="handleDelete"
                            >
                                <span class="material-symbols-rounded text-base">delete</span>
                                <span class="hidden sm:inline">刪除</span>
                            </button>
                            <button
                                type="button"
                                class="btn-admin-primary"
                                :disabled="saving || !editableRecord"
                                @click="handleSave"
                            >
                                <span class="material-symbols-rounded text-base">save</span>
                                <span class="hidden sm:inline">{{ saving ? "儲存中..." : "儲存" }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <BaseModal
        :show="showUnsavedModal"
        title="尚未儲存的變更"
        icon="warning"
        icon-color="text-amber-500"
        @close="showUnsavedModal = false; pendingAction = null"
    >
        <p class="text-gray-600 dark:text-gray-400 mb-6">
            目前編輯內容尚未儲存，確定要離開並放棄變更嗎？
        </p>
        <template #actions>
            <button type="button" class="btn-modal-cancel" @click="showUnsavedModal = false; pendingAction = null">取消</button>
            <button type="button" class="btn-modal-danger" @click="discardAndProceed">放棄變更</button>
        </template>
    </BaseModal>

    <BaseModal
        :show="showFieldSettings"
        title="欄位設定"
        icon="settings"
        max-width="max-w-lg"
        @close="showFieldSettings = false"
    >
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">取消勾選即可隱藏欄位。</p>
        <div class="max-h-[min(60vh,28rem)] overflow-y-auto space-y-3">
            <section v-for="section in formSections" :key="section.id" class="space-y-1">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400">{{ section.title }}</h4>
                <label
                    v-for="field in section.fields"
                    :key="field.name"
                    class="flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                    <input
                        type="checkbox"
                        class="peer sr-only"
                        :checked="!hiddenFields.has(field.name)"
                        @change="toggleFieldHidden(field.name)"
                    />
                    <span
                        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-black/15 dark:border-white/20 bg-black/[0.04] dark:bg-white/10 text-transparent transition-colors
                               peer-checked:border-gray-900 peer-checked:bg-gray-900 peer-checked:text-white
                               dark:peer-checked:border-white dark:peer-checked:bg-white dark:peer-checked:text-black
                               peer-focus-visible:ring-2 peer-focus-visible:ring-black/20 dark:peer-focus-visible:ring-white/20"
                        aria-hidden="true"
                    >
                        <span class="material-symbols-rounded text-[16px] leading-none">check</span>
                    </span>
                    <span class="text-sm text-gray-400 dark:text-gray-500 peer-checked:text-gray-800 dark:peer-checked:text-gray-100 truncate transition-colors">
                        {{ field.label }}
                    </span>
                </label>
            </section>
        </div>
        <template #actions>
            <button type="button" class="btn-modal-cancel" @click="hideAllFields">全部隱藏</button>
            <button type="button" class="btn-modal-cancel" @click="hiddenFields.clear()">全部顯示</button>
            <button type="button" class="btn-admin-primary" @click="showFieldSettings = false">完成</button>
        </template>
    </BaseModal>
</template>

<style scoped>
.admin-panel {
    @apply rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white/90 dark:bg-gray-950/80 shadow-sm backdrop-blur;
}

.admin-input {
    @apply w-full rounded-full border border-transparent bg-black/5 dark:bg-white/10 text-sm px-4 py-2.5
           text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
           focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-transparent
           transition-shadow disabled:opacity-60 disabled:cursor-not-allowed;
}

.admin-textarea {
    @apply w-full rounded-2xl border border-transparent bg-black/5 dark:bg-white/10 text-sm px-4 py-2.5
           text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
           focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 focus:border-transparent
           transition-shadow disabled:opacity-60 overflow-y-auto;
    field-sizing: content;
    min-height: 4.5rem;
    max-height: 16rem;
    resize: none;
}

.btn-admin-primary {
    @apply inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full font-medium
           bg-gray-900 dark:bg-white text-white dark:text-black
           hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed;
}

.btn-admin-ghost {
    @apply text-sm px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300
           hover:bg-black/10 dark:hover:bg-white/20 transition-colors;
}
</style>

