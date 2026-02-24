<script setup>
const appConfig = useAppConfig()
useHead({ title: `服務條款 | ${appConfig.siteName}` })
</script>

<template>
    <div class="max-w-7xl mx-auto px-4 py-6">
        <div class="flex flex-wrap items-baseline justify-between gap-2 mb-10">
            <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">服務條款</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">最後更新：2026 年</p>
        </div>

        <div class="prose prose-gray dark:prose-invert max-w-none space-y-8 text-gray-700 dark:text-gray-300">
            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">一、服務說明</h2>
                <p>
                    AnimeTV（以下稱「本服務」）提供動畫節目之瀏覽、搜尋與觀看紀錄等相關功能。使用本服務即表示您同意遵守本服務條款。若您不同意本條款，請勿使用本服務。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">二、帳戶與登入</h2>
                <p>
                    您可透過第三方登入（如 Google、Discord）使用本服務。您應妥善保管登入資訊，並對透過您帳戶所進行之行為負責。若發現帳戶遭未經授權使用，請立即通知我們。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">三、使用規範</h2>
                <p class="mb-3">使用本服務時，您同意：</p>
                <ul class="list-disc pl-6 space-y-2">
                    <li>僅將本服務用於個人、非商業之觀賞目的；</li>
                    <li>不進行任何干擾、破壞系統或侵害他人權益之行為；</li>
                    <li>不嘗試規避技術保護或未經授權存取資料；</li>
                    <li>遵守當地法律及本服務之相關政策。</li>
                </ul>
                <p class="mt-3">
                    我們保留暫停或終止違反本條款之帳戶的權利，恕不另行通知。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">四、內容與智慧財產</h2>
                <p>
                    本服務所呈現之節目資訊與內容，其智慧財產權歸屬各自權利人。本服務僅提供瀏覽與索引功能，不主張對第三方內容之權利。您不得下載、重製、散布或商業利用本服務所顯示之內容，除非取得權利人授權或法律允許。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">五、免責聲明</h2>
                <p>
                    本服務依「現狀」提供，我們不保證服務不中斷、無錯誤或完全符合您的預期。在法律允許之範圍內，我們對於因使用或無法使用本服務所生之任何直接、間接、衍生損害不負責任。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">六、條款變更</h2>
                <p>
                    我們可能隨時修訂本服務條款，修訂後之條款將於本頁公布；若修訂涉及重大權益變更，我們會以適當方式通知。繼續使用本服務即視為接受修訂後之條款。
                </p>
            </section>

            <section>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">七、聯絡我們</h2>
                <p>
                    若您對本服務條款有任何疑問，歡迎透過本網站或應用程式內提供之管道與我們聯絡。
                </p>
            </section>
        </div>

        <div class="mt-12 pt-8 border-t border-gray-200 dark:border-white/10">
            <NuxtLink
                to="/privacy"
                class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:underline"
            >
                查看隱私政策
            </NuxtLink>
        </div>
    </div>
</template>
