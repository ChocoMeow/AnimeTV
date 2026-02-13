<script setup>
const appConfig = useAppConfig()

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')

const records = ref([])
const fields = ref([])

const selectedRecord = ref(null)
const editableRecord = ref(null)

const searchField = ref('')
const searchValue = ref('')
const searchOperator = ref('eq')

const searchOperatorOptions = [
    { value: 'eq', label: '等於 (=)' },
    { value: 'like', label: '包含 (LIKE)' },
    { value: 'gte', label: '大於等於 (>=)' },
    { value: 'lte', label: '小於等於 (<=)' },
    { value: 'neq', label: '不等於 (≠)' },
    { value: 'in', label: '在列表中 (IN，逗號分隔)' },
]

const page = ref(1)
const pageSize = ref(50)
const total = ref(0)

const isCreating = ref(false)

// Chinese (Hong Kong) labels for anime_meta fields
const fieldLabels = {
    id: '內部編號',
    source_id: '外部作品編號（source_id）',
    title: '作品標題',
    description: '作品簡介',
    thumbnail: '封面圖片連結',
    premiere_date: '首播日期',
    director: '導演',
    distributor: '發行商',
    production_company: '製作公司',
    tags: '標籤（tags）',
    views: '觀看次數',
    score: '評分（score）',
    votes: '評分人數（votes）',
    related_anime_source_ids: '相關作品編號（related_anime_source_ids）',
    source_details_id: '詳細資料編號（source_details_id）',
    video_id: '站內片源 ID（video_id）',
    season: '季數（season）',
    created_at: '建立時間',
    updated_at: '更新時間',
}

function toEditableRecord(raw) {
    return { ...(raw || {}) }
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

        const res = await $fetch(`/api/admin/anime-meta?${query.toString()}`)

        records.value = res.items || []
        fields.value = res.fields || []
        total.value = res.total || records.value.length

        // Initialize default search field, but
        // do NOT auto-select any record in the editor.
        if (!searchField.value && fields.value.length) {
            searchField.value = fields.value[0]
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
    selectedRecord.value = record
    editableRecord.value = toEditableRecord(record)
    isCreating.value = false
}

function handleCreateNew() {
    const base = {}
    for (const field of fields.value) {
        if (['id', 'created_at', 'updated_at'].includes(field)) continue
        base[field] = ''
    }
    editableRecord.value = toEditableRecord(base)
    selectedRecord.value = null
    isCreating.value = true
}

async function handleSave() {
    if (!editableRecord.value) return

    saving.value = true
    errorMessage.value = ''

    try {
        const payload = { ...editableRecord.value }

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

        await loadRecords()

        if (result) {
            const match = records.value.find((r) => r.source_id === result.source_id)
            if (match) {
                handleSelect(match)
            }
        }
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

// Search field dropdown options with Chinese labels
const searchFieldOptions = computed(() =>
    fields.value.map((f) => ({ value: f, label: fieldLabels[f] || f }))
)

function changePage(newPage) {
    if (newPage < 1 || newPage > totalPages.value) return
    page.value = newPage
    loadRecords()
}

function applySearch() {
    page.value = 1
    loadRecords()
}

useHead({
    title: `管理後台 | ${appConfig.siteName}`,
})

onMounted(() => {
    loadRecords()
})

// chip input logic moved into reusable ChipInput component
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <!-- Header -->
        <div class="flex items-center justify-between">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">動畫資料管理</h1>
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
                <div
                    class="rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white/90 dark:bg-gray-950/80 shadow-sm backdrop-blur"
                >
                    <div class="px-4 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-base text-gray-500 dark:text-gray-400">search</span>
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
                            <label class="text-xs font-medium text-gray-600 dark:text-gray-300">關鍵字</label>
                            <input
                                v-model="searchValue"
                                type="text"
                                :placeholder="searchOperator === 'in' ? '多個值請用逗號分隔' : '輸入欄位值進行搜尋'"
                                class="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-black/5 dark:bg-white/10 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/70 dark:focus:ring-white/70"
                                @keyup.enter="applySearch"
                            />
                        </div>

                        <div class="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                class="text-sm px-4 py-2 rounded-lg bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                @click="
                                    searchValue = '';
                                    page = 1;
                                    loadRecords();
                                "
                            >
                                重設
                            </button>
                            <button
                                type="button"
                                class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                                @click="applySearch"
                            >
                                <span class="material-icons text-xs">search</span>
                                套用搜尋
                            </button>
                        </div>
                    </div>
                </div>

                <!-- List Card -->
                <div
                    class="rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white/90 dark:bg-gray-950/80 shadow-sm backdrop-blur flex flex-col max-h-[600px]"
                >
                    <div class="px-4 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-base text-gray-500 dark:text-gray-400">view_list</span>
                            <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">紀錄列表</h2>
                        </div>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                            共 {{ total }} 部
                        </span>
                    </div>
                    <div class="flex-1 overflow-auto">
                        <div v-if="loading" class="flex items-center justify-center py-10">
                            <div class="animate-spin rounded-full h-10 w-10 border-4 border-gray-600 border-t-transparent"></div>
                        </div>

                        <div v-else-if="!records.length" class="py-8 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                            目前沒有任何紀錄，請點選右上方「新增紀錄」建立。
                        </div>

                        <ul v-else class="divide-y divide-gray-100 dark:divide-white/5">
                            <li
                                v-for="record in records"
                                :key="record.source_id || record.id"
                                :class="[
                                    'px-4 py-3 cursor-pointer transition-colors flex items-center gap-3',
                                    selectedRecord && (selectedRecord.source_id || selectedRecord.id) === (record.source_id || record.id)
                                        ? 'bg-black/5 dark:bg-white/10'
                                        : 'hover:bg-gray-50 dark:hover:bg-white/5',
                                ]"
                                @click="handleSelect(record)"
                            >
                                <!-- Thumbnail -->
                                <div class="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200/70 dark:border-white/10">
                                    <img
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
                                        站內片源：{{ record.video_id || '未綁定' }} · 季數：{{ record.season || '—' }}
                                    </p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <!-- Simple Pagination -->
                    <div
                        v-if="totalPages > 1"
                        class="px-4 py-2 border-t border-gray-100 dark:border-white/10 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
                    >
                        <span> 第 {{ page }} / {{ totalPages }} 頁 </span>
                        <div class="flex items-center gap-2">
                            <button
                                type="button"
                                class="px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                                :disabled="page <= 1"
                                @click="changePage(page - 1)"
                            >
                                上一頁
                            </button>
                            <button
                                type="button"
                                class="px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
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
            <div
                class="rounded-2xl border border-gray-200/80 dark:border-white/10 bg-white/90 dark:bg-gray-950/80 shadow-sm backdrop-blur flex flex-col"
            >
                <div class="px-4 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="material-icons text-base text-gray-500 dark:text-gray-400">edit</span>
                        <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {{ isCreating ? "新增紀錄" : "編輯紀錄" }}
                        </h2>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="handleCreateNew"
                        >
                            <span class="material-icons text-base">add</span>
                            <span class="hidden sm:inline">新增紀錄</span>
                        </button>
                        <button
                            v-if="selectedRecord"
                            type="button"
                            class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                            :disabled="saving"
                            @click="handleDelete"
                        >
                            <span class="material-icons text-base">delete</span>
                            <span class="hidden sm:inline">刪除</span>
                        </button>
                        <button
                            type="button"
                            class="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            :disabled="saving || !editableRecord"
                            @click="handleSave"
                        >
                            <span class="material-icons text-base">save</span>
                            <span class="hidden sm:inline">{{ saving ? "儲存中..." : "儲存" }}</span>
                        </button>
                    </div>
                </div>

                <div class="px-4 py-4 space-y-4">
                    <div v-if="errorMessage" class="rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200/70 dark:border-red-500/40 px-3 py-2 text-xs text-red-700 dark:text-red-200">
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
                            <div class="w-32 h-44 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200/70 dark:border-white/10 flex-shrink-0">
                                <img
                                    v-if="editableRecord.thumbnail"
                                    :src="editableRecord.thumbnail"
                                    :alt="editableRecord.title || editableRecord.source_id || 'thumbnail preview'"
                                    class="w-full h-full object-cover"
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
                            class="space-y-4"
                            @submit.prevent="handleSave"
                        >
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div
                                    v-for="field in fields"
                                    :key="field"
                                    class="space-y-1.5"
                                >
                                    <label class="text-xs font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1">
                                        <span>{{ fieldLabels[field] || field }}</span>
                                        <span
                                            v-if="field === 'source_id'"
                                            class="px-1.5 py-0.5 rounded-full bg-black/80 dark:bg-white text-white dark:text-black text-[10px] font-semibold"
                                        >
                                            主鍵
                                        </span>
                                        <span
                                            v-else-if="['id', 'created_at', 'updated_at'].includes(field)"
                                            class="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-[10px] text-gray-600 dark:text-gray-300"
                                        >
                                            只讀
                                        </span>
                                    </label>

                                    <!-- Tags chip input (textarea-like) -->
                                    <div v-if="field === 'tags'">
                                        <ChipInput
                                            v-model="editableRecord.tags"
                                            placeholder="輸入標籤後按空白或 Enter"
                                            hint='會儲存為字串陣列，例如 ["動作","冒險"]'
                                        />
                                    </div>

                                    <!-- Related anime chip input (textarea-like) -->
                                    <div v-else-if="field === 'related_anime_source_ids'">
                                        <ChipInput
                                            v-model="editableRecord.related_anime_source_ids"
                                            placeholder="輸入作品編號後按空白或 Enter"
                                            hint='會儲存為外部編號陣列，例如 ["12345","67890"]'
                                        />
                                    </div>

                                    <!-- Normal text fields -->
                                    <input
                                        v-else
                                        v-model="editableRecord[field]"
                                        :readonly="['id', 'created_at', 'updated_at'].includes(field)"
                                        type="text"
                                        class="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-black/5 dark:bg-white/10 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/70 dark:focus:ring-white/70 disabled:opacity-60"
                                    />
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

