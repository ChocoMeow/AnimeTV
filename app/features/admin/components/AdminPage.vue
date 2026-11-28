<script setup>
const {
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
} = useAdminPage()
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
                                class="field"
                                @keyup.enter="applySearch"
                            />
                        </div>

                        <div class="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                class="btn-modal-cancel"
                                @click="resetSearch"
                            >
                                重設
                            </button>
                            <button
                                type="button"
                                class="btn-primary"
                                @click="applySearch"
                            >
                                <span class="material-symbols-rounded">search</span>
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
                            <LoadingSpinner size="lg" />
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
                                <AppImage
                                    :src="record.thumbnail"
                                    :alt="record.title || record.source_id || 'anime thumbnail'"
                                    class="flex-shrink-0 w-12 aspect-[2/3] rounded-lg bg-gray-100"
                                    icon-class="text-lg"
                                >
                                    <template #error>
                                        <span class="text-[10px] text-gray-400 dark:text-gray-500">無封面</span>
                                    </template>
                                </AppImage>

                                <!-- Text info -->
                                <div class="flex flex-col gap-0.5 min-w-0">
                                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {{ record.title || '(未設定標題)' }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        外部編號：{{ record.source_id || record.id || '—' }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        片源：{{ record.video_source || defaultVideoSource }} · ID：{{ record.video_id || '未綁定' }} · 季數：{{ record.season || '—' }}
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
                            class="btn-modal-cancel"
                            title="欄位設定"
                            @click="showFieldSettings = true"
                        >
                            <span class="material-symbols-rounded text-base">settings</span>
                            <span class="hidden sm:inline">欄位設定</span>
                        </button>
                        <button
                            type="button"
                            class="btn-modal-cancel"
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
                            <AppImage
                                :src="editableRecord.thumbnail"
                                :alt="editableRecord.title || editableRecord.source_id || 'thumbnail preview'"
                                class="w-32 aspect-[2/3] rounded-xl bg-gray-100 flex-shrink-0"
                            >
                                <template #error>
                                    <span class="px-2 text-center text-xs text-gray-400 dark:text-gray-500">無封面預覽</span>
                                </template>
                            </AppImage>
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
                                        <AppTooltip v-if="field.description" :text="field.description">
                                            <button type="button" class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" :aria-label="`${field.label}說明`">
                                                <span class="material-symbols-rounded text-sm">info</span>
                                            </button>
                                        </AppTooltip>
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

                                    <!-- Input + server-driven trailing actions (link / autofill / …) -->
                                    <div v-else-if="field.actions?.length" class="flex gap-2">
                                        <input
                                            v-if="field.type === 'number'"
                                            v-model.number="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="number"
                                            step="1"
                                            class="field min-w-0 flex-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                        <input
                                            v-else
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="text"
                                            class="field min-w-0 flex-1"
                                        />
                                        <template v-for="(action, i) in field.actions" :key="`${action.type}-${i}`">
                                            <a
                                                v-if="action.type === 'link'"
                                                :href="actionHref(action, editableRecord[field.name])"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="btn-modal-cancel shrink-0"
                                                :class="{ 'pointer-events-none opacity-40': !editableRecord[field.name] }"
                                                :title="action.title"
                                            >
                                                <span class="material-symbols-rounded text-xl">open_in_new</span>
                                            </a>
                                            <button
                                                v-else-if="action.type === 'autofill'"
                                                type="button"
                                                class="btn-modal-cancel shrink-0"
                                                :title="action.title"
                                                :disabled="autofilling || !editableRecord[field.name]"
                                                @click="handleAutofill"
                                            >
                                                <span
                                                    class="material-symbols-rounded text-xl"
                                                    :class="autofilling ? 'animate-spin' : ''"
                                                >
                                                    {{ autofilling ? 'progress_activity' : 'auto_fix' }}
                                                </span>
                                            </button>
                                        </template>
                                    </div>

                                    <!-- video_source enum -->
                                    <div v-else-if="field.name === 'video_source'">
                                        <Dropdown
                                            v-model="editableRecord[field.name]"
                                            :options="videoSources"
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
                                            class="field [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                                            class="field [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        />
                                    </div>

                                    <!-- Date fields -->
                                    <div v-else-if="field.type === 'date'" class="relative">
                                        <input
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="date"
                                            class="field [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:dark:invert"
                                            @change="field.name === 'premiere_date' && syncSeasonFromPremiereDate()"
                                        />
                                    </div>

                                    <!-- Datetime fields -->
                                    <div v-else-if="field.type === 'datetime'" class="relative">
                                        <input
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="datetime-local"
                                            class="field [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:dark:invert"
                                        />
                                    </div>

                                    <!-- Boolean fields -->
                                    <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2">
                                        <input
                                            :id="`checkbox-${field.name}`"
                                            v-model="editableRecord[field.name]"
                                            :readonly="field.readOnly"
                                            type="checkbox"
                                            class="control-checkbox disabled:opacity-60"
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
                                        class="field-textarea"
                                    />

                                    <!-- JSONB fields (editable JSON textarea, saved as object) -->
                                    <textarea
                                        v-else-if="field.type === 'jsonb'"
                                        v-model="editableRecord[field.name]"
                                        :readonly="field.readOnly"
                                        rows="2"
                                        placeholder="{}"
                                        class="field-textarea font-mono"
                                    />

                                    <!-- Text fields (default) -->
                                    <input
                                        v-else
                                        v-model="editableRecord[field.name]"
                                        :readonly="field.readOnly"
                                        type="text"
                                        class="field"
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
                                class="btn-primary"
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
        @close="cancelPendingAction"
    >
        <p class="text-gray-600 dark:text-gray-400 mb-6">
            目前編輯內容尚未儲存，確定要離開並放棄變更嗎？
        </p>
        <template #actions>
            <button type="button" class="btn-modal-cancel" @click="cancelPendingAction">取消</button>
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
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">取消勾選即可隱藏欄位，使用箭頭調整區段順序。</p>
        <div class="max-h-[min(60vh,28rem)] overflow-y-auto space-y-3">
            <section v-for="(section, index) in settingsFormSections" :key="section.id" class="space-y-1">
                <div class="flex items-center justify-between gap-2">
                    <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400">{{ section.title }}</h4>
                    <div class="flex items-center gap-0.5">
                        <button
                            type="button"
                            class="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                            title="上移"
                            :disabled="index === 0"
                            @click="moveSection(section.id, -1)"
                        >
                            <span class="material-symbols-rounded text-base leading-none">keyboard_arrow_up</span>
                        </button>
                        <button
                            type="button"
                            class="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
                            title="下移"
                            :disabled="index === settingsFormSections.length - 1"
                            @click="moveSection(section.id, 1)"
                        >
                            <span class="material-symbols-rounded text-base leading-none">keyboard_arrow_down</span>
                        </button>
                    </div>
                </div>
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
            <button type="button" class="btn-primary" @click="showFieldSettings = false">完成</button>
        </template>
    </BaseModal>
</template>

<style scoped>
.admin-panel {
    @apply rounded-2xl bg-white/90 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-950/80 dark:ring-white/10;
}
</style>
