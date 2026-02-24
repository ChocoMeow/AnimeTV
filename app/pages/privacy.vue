<script setup>
const appConfig = useAppConfig()
useHead({ title: `隱私政策 | ${appConfig.siteName}` })
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div class="flex flex-wrap items-baseline justify-between gap-2 mb-10">
            <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">隱私政策</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">最後更新：2026 年</p>
        </div>

        <div class="prose prose-gray dark:prose-invert max-w-none space-y-8 text-gray-700 dark:text-gray-300">
            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">一、概述</h2>
                <p>
                    AnimeTV（以下稱「我們」或「本服務」）重視您的隱私。本隱私政策說明我們如何蒐集、使用及保護與您使用本服務相關之資訊。使用本服務即表示您同意本政策所載之做法。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">二、我們蒐集的資訊</h2>
                <p class="mb-3">為提供登入、個人化與觀看紀錄等功能，我們可能蒐集：</p>
                <ul class="list-disc pl-6 space-y-2">
                    <li><strong class="text-gray-900 dark:text-white">帳戶資訊：</strong>經由第三方登入（如 Google、Discord）取得之電子郵件、顯示名稱及頭像等，由該第三方依其政策提供；</li>
                    <li><strong class="text-gray-900 dark:text-white">使用與觀看紀錄：</strong>您於本服務中瀏覽、點擊之節目與觀看進度等，用於紀錄與續播功能；</li>
                    <li><strong class="text-gray-900 dark:text-white">技術與裝置資訊：</strong>如 IP 位址、瀏覽器類型、裝置類型等，用於維運與安全。</li>
                </ul>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">三、資訊的使用方式</h2>
                <p>我們使用上述資訊以：</p>
                <ul class="list-disc pl-6 space-y-2 mt-2">
                    <li>提供、維護與改進本服務；</li>
                    <li>記住您的觀看進度並提供續播功能；</li>
                    <li>保障服務安全與防範濫用；</li>
                    <li>遵守法律義務或回應合法請求。</li>
                </ul>
                <p class="mt-3">
                    我們不會將您的個人資料出售予第三方。若為提供服務而使用第三方服務（如身份驗證、雲端資料庫），該等服務僅依我們之指示處理資料，並受其各自之隱私政策規範。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">四、資料儲存與安全</h2>
                <p>
                    您的帳戶與觀看紀錄等資料儲存於受業界標準保護之環境。我們採取合理技術與組織措施以降低未經授權存取、變更或洩漏之風險，惟無法保證絕對安全。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">五、您的權利</h2>
                <p>
                    您得於本服務內查看、管理觀看紀錄，並可透過登出或刪除帳戶停止使用本服務。若您希望刪除帳戶或相關資料，可透過本網站或應用程式內提供之管道與我們聯絡，我們將依適用法律與技術可行性協助處理。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">六、Cookie 與類似技術</h2>
                <p>
                    本服務可能使用 Cookie 或類似技術以維持登入狀態、記住偏好及分析使用情況。您可透過瀏覽器設定管理 Cookie；若停用部分 Cookie，可能影響登入或部分功能之運作。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">七、政策變更</h2>
                <p>
                    我們可能不定期更新本隱私政策，更新內容將公布於本頁並註明最後更新日期。重大變更時，我們會以適當方式通知。繼續使用本服務即視為接受更新後之政策。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">八、聯絡我們</h2>
                <p>
                    若您對本隱私政策或個人資料處理有任何疑問或請求，歡迎透過本網站或應用程式內提供之管道與我們聯絡。
                </p>
            </section>
        </div>

        <div class="mt-12 pt-8 border-t border-gray-200 dark:border-white/10">
            <NuxtLink
                to="/terms"
                class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:underline"
            >
                查看服務條款
            </NuxtLink>
        </div>
    </div>
</template>
