<script setup>
const features = [
    {
        id: 'resume',
        glyph: '續',
        title: '續播與觀看紀錄',
        body: '從上次停下的秒數繼續。跨裝置同步觀看進度，回到任何一集都不必重找。',
    },
    {
        id: 'offline',
        glyph: '離',
        title: '離線下載',
        body: 'MP4 與 HLS 集數可下載至本機，暫停、續傳與取消都由下載管理頁統一處理。',
    },
    {
        id: 'friends',
        glyph: '友',
        title: '好友與即時狀態',
        body: '加好友、管理邀請，看見誰正在追哪一部——社交只在你要分享的時候出現。',
    },
    {
        id: 'ai',
        glyph: '智',
        title: 'AI 助手（選用）',
        body: '查詢、推薦與設定建議；首次使用前需於介面中明確同意隱私授權。',
        badge: '選用',
    },
    {
        id: 'player',
        glyph: '播',
        title: '自訂播放器',
        body: '劇院模式、自動下一集、跳過 OP、倍速、HLS 畫質、縮圖拖曳與可自訂快捷鍵。',
    },
    {
        id: 'schedule',
        glyph: '番',
        title: '每日新番與搜尋',
        body: '週間表、精選、主題與篩選；Bahamut 元資料加上可設定的播放來源，一站完成。',
    },
]
</script>

<template>
    <div class="feature-showcase">
        <article
            v-for="feat in features"
            :key="feat.id"
            class="feature-card"
        >
            <div class="feature-visual" :data-scene="feat.id">
                <div class="feature-glyph-wrap">
                    <span class="feature-glyph font-display" aria-hidden="true">{{ feat.glyph }}</span>
                </div>

                <!-- Resume -->
                <div v-if="feat.id === 'resume'" class="scene scene-resume" aria-hidden="true">
                    <div class="resume-stack">
                        <div class="resume-frame">
                            <div class="resume-poster" />
                            <div class="resume-bar">
                                <div class="resume-bar-fill">
                                    <span class="resume-thumb" />
                                </div>
                            </div>
                        </div>
                        <div class="resume-meta">
                            <span class="resume-ep">第 8 集</span>
                            <span class="resume-time">12:34</span>
                        </div>
                        <div class="resume-cta">
                            <span class="material-symbols-rounded resume-play">play_arrow</span>
                            <span>繼續</span>
                        </div>
                        <span class="material-symbols-rounded resume-sync">sync</span>
                    </div>
                </div>

                <!-- Offline -->
                <div v-else-if="feat.id === 'offline'" class="scene scene-offline" aria-hidden="true">
                    <div class="dl-simple">
                        <div class="dl-meta">
                            <span class="dl-ep">第 8 集</span>
                            <span class="dl-status">
                                <span class="dl-pct">72%</span>
                                <span class="dl-done">完成</span>
                            </span>
                        </div>
                        <div class="dl-track">
                            <span class="dl-fill" />
                        </div>
                        <span class="dl-foot">
                            <span class="dl-foot-ing">3 集下載中</span>
                            <span class="dl-foot-ok">3 集已下載</span>
                        </span>
                    </div>
                </div>

                <!-- Friends -->
                <div v-else-if="feat.id === 'friends'" class="scene scene-friends" aria-hidden="true">
                    <div class="friend-map">
                        <svg class="friend-lines" viewBox="0 0 120 72" aria-hidden="true">
                            <line class="friend-line" x1="24" y1="48" x2="60" y2="18" />
                            <line class="friend-line" x1="96" y1="48" x2="60" y2="18" />
                        </svg>
                        <div class="friend-node n1">
                            <span class="friend-logo friend-logo-t1" aria-hidden="true" />
                            <span class="friend-dot idle" />
                        </div>
                        <div class="friend-node n2 active">
                            <span class="friend-logo friend-logo-t2" aria-hidden="true" />
                            <span class="friend-dot watching" />
                            <span class="material-symbols-rounded friend-play">play_circle</span>
                        </div>
                        <div class="friend-node n3">
                            <span class="friend-logo friend-logo-t3" aria-hidden="true" />
                            <span class="friend-dot online" />
                        </div>
                        <p class="friend-status">正在觀看</p>
                    </div>
                </div>

                <!-- AI -->
                <div v-else-if="feat.id === 'ai'" class="scene scene-ai" aria-hidden="true">
                    <div class="ai-stack">
                        <div class="ai-spark s1" /><div class="ai-spark s2" /><div class="ai-spark s3" />
                        <div class="ai-bubble ai-bubble-user">
                            <span>推薦熱血番</span>
                        </div>
                        <div class="ai-bubble ai-bubble-bot">
                            <span class="material-symbols-rounded ai-icon">smart_toy</span>
                            <div class="ai-reply">
                                <span class="ai-reply-line w1" />
                                <span class="ai-reply-line w2" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Player -->
                <div v-else-if="feat.id === 'player'" class="scene scene-player" aria-hidden="true">
                    <div class="player-mini">
                        <div class="player-mini-screen" />
                        <div class="player-mini-track">
                            <div class="player-mini-buffer" />
                            <div class="player-mini-progress">
                                <span class="player-mini-thumb" />
                            </div>
                        </div>
                        <div class="player-mini-toolbar">
                            <span class="material-symbols-rounded player-mini-btn">pause</span>
                            <span class="player-mini-skip">跳過 OP</span>
                            <span class="player-mini-speed">1.25×</span>
                        </div>
                    </div>
                </div>

                <!-- Schedule -->
                <div v-else-if="feat.id === 'schedule'" class="scene scene-schedule" aria-hidden="true">
                    <div class="schedule-wrap">
                        <div class="schedule-days">
                            <span class="schedule-highlight" aria-hidden="true" />
                            <span v-for="d in ['一', '二', '三', '四', '五', '六', '日']" :key="d" class="schedule-day">{{ d }}</span>
                        </div>
                        <p class="schedule-count"><span class="schedule-count-num">3</span> 部更新</p>
                        <div class="schedule-posters">
                            <div class="schedule-poster p1"><span class="schedule-poster-shine" /></div>
                            <div class="schedule-poster p2"><span class="schedule-poster-shine" /></div>
                            <div class="schedule-poster p3"><span class="schedule-poster-shine" /></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="feature-copy">
                <div class="feature-copy-head">
                    <h3 class="feature-title">{{ feat.title }}</h3>
                    <span v-if="feat.badge" class="feature-badge">{{ feat.badge }}</span>
                </div>
                <p class="feature-body">{{ feat.body }}</p>
            </div>
        </article>
    </div>
</template>

<style scoped>
.font-display {
    font-family: 'ZCOOL KuHei', 'Noto Sans TC', sans-serif;
}

.feature-showcase {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 640px) {
    .feature-showcase {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.125rem;
    }
}

@media (min-width: 1024px) {
    .feature-showcase {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}

.feature-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-radius: 1rem;
    overflow: hidden;
    border: 1.5px solid rgba(13, 13, 13, 0.1);
    background: rgba(255, 255, 255, 0.65);
    backdrop-filter: blur(6px);
    transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
}

.dark .feature-card {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
}

.feature-card:hover {
    border-color: rgba(13, 13, 13, 0.2);
    box-shadow: 0 16px 40px -16px rgba(13, 13, 13, 0.18);
    transform: translateY(-2px);
}

.dark .feature-card:hover {
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.45);
}

.feature-visual {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    aspect-ratio: 16 / 10;
    overflow: hidden;
    background: #0d0d0d;
    isolation: isolate;
}

.feature-glyph-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    overflow: hidden;
    position: relative;
    z-index: 2;
}

.feature-glyph {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    height: 1em;
    font-size: clamp(4.25rem, 11vw, 5.75rem);
    line-height: 1;
    font-weight: 400;
    color: #f5f5f0;
    text-shadow: 0 4px 40px rgba(255, 255, 255, 0.12);
    pointer-events: none;
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.feature-card:hover .feature-glyph {
    transform: scale(1.05);
}

.scene {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0.75rem;
    overflow: hidden;
    border-left: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 65%);
}

.scene::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, transparent 65%);
    opacity: 0;
    transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
}

.scene > * {
    position: relative;
    z-index: 1;
}

.feature-visual::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: radial-gradient(ellipse 90% 70% at 50% 0%, rgba(255, 255, 255, 0.07) 0%, transparent 60%);
    opacity: 0;
    transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
}

.feature-visual::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    background: radial-gradient(ellipse 90% 70% at 50% 0%, rgba(255, 255, 255, 0.04) 0%, transparent 60%);
    pointer-events: none;
}

.feature-card:hover .scene::after {
    opacity: 1;
}

.feature-card:hover .feature-visual::before {
    opacity: 1;
}

/* ── Resume ── */
.scene-resume {
    padding: 0.5rem;
}

.resume-stack {
    position: relative;
    width: 100%;
    max-width: 9.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
}

.resume-frame {
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.35);
}

.resume-poster {
    height: 2.75rem;
    background: linear-gradient(135deg, #2a2a2a 0%, #4a4a4a 40%, #1a1a1a 100%);
    animation: resume-shimmer 3s ease-in-out infinite;
}

@keyframes resume-shimmer {
    0%, 100% { filter: brightness(0.9); }
    50% { filter: brightness(1.1); }
}

.resume-bar {
    height: 3px;
    background: rgba(255, 255, 255, 0.15);
}

.resume-bar-fill {
    position: relative;
    height: 100%;
    width: 38%;
    background: #f5f5f0;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.35);
    animation: resume-fill 3.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes resume-fill {
    0%, 100% { width: 28%; }
    50% { width: 68%; }
}

.resume-thumb {
    position: absolute;
    right: 0;
    top: 50%;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 9999px;
    background: #fff;
    transform: translate(50%, -50%);
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.6);
}

.resume-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.5625rem;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.55);
}

.resume-ep { font-weight: 600; color: rgba(255, 255, 255, 0.8); }

.resume-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    align-self: flex-start;
    padding: 0.2rem 0.55rem 0.2rem 0.35rem;
    border-radius: 9999px;
    font-size: 0.5625rem;
    font-weight: 700;
    color: #0d0d0d;
    background: #f5f5f0;
    animation: resume-cta 2.8s ease-in-out infinite;
}

@keyframes resume-cta {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.2); }
    50% { transform: scale(1.04); box-shadow: 0 0 12px rgba(255, 255, 255, 0.25); }
}

.resume-play { font-size: 0.875rem; }

.resume-sync {
    position: absolute;
    top: 0;
    right: 0;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.45);
    animation: resume-sync 2.4s ease-in-out infinite;
}

@keyframes resume-sync {
    0%, 100% { transform: rotate(0deg); opacity: 0.4; }
    50% { transform: rotate(180deg); opacity: 0.85; }
}

/* ── Offline ── */
.scene-offline {
    padding: 0.5rem;
}

.dl-simple {
    width: 100%;
    max-width: 8.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
}

.dl-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.5625rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
}

.dl-pct {
    font-variant-numeric: tabular-nums;
    color: #f5f5f0;
    animation: dl-phase-pct 5s ease-in-out infinite;
}

.dl-status {
    position: relative;
    min-width: 1.75rem;
    height: 0.7rem;
}

.dl-pct,
.dl-done {
    position: absolute;
    right: 0;
    top: 0;
}

.dl-done {
    color: #4ade80;
    animation: dl-phase-done 5s ease-in-out infinite;
}

@keyframes dl-phase-pct {
    0%, 46% { opacity: 1; }
    52%, 70% { opacity: 0; }
    76%, 100% { opacity: 1; }
}

@keyframes dl-phase-done {
    0%, 46% { opacity: 0; transform: scale(0.92); }
    52%, 70% { opacity: 1; transform: scale(1); }
    76%, 100% { opacity: 0; transform: scale(0.92); }
}

.dl-track {
    height: 4px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
}

.dl-fill {
    display: block;
    height: 100%;
    width: 72%;
    border-radius: inherit;
    background: #f5f5f0;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
    animation: dl-fill 5s ease-in-out infinite;
}

@keyframes dl-fill {
    0% { width: 38%; background: #f5f5f0; box-shadow: 0 0 8px rgba(255, 255, 255, 0.2); }
    38% { width: 72%; }
    50% { width: 100%; background: #4ade80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.35); }
    68% { width: 100%; background: #4ade80; }
    78% { width: 38%; background: #f5f5f0; box-shadow: 0 0 8px rgba(255, 255, 255, 0.2); }
    100% { width: 38%; }
}

.dl-foot {
    position: relative;
    height: 0.7rem;
    font-size: 0.5rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
}

.dl-foot-ing,
.dl-foot-ok {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.dl-foot-ing {
    animation: dl-phase-pct 5s ease-in-out infinite;
}

.dl-foot-ok {
    color: #4ade80;
    animation: dl-phase-done 5s ease-in-out infinite;
}

/* ── Friends ── */
.scene-friends { padding: 0.5rem; }

.friend-map {
    position: relative;
    width: 7.5rem;
    height: 4.5rem;
}

.friend-lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

.friend-line {
    stroke: rgba(255, 255, 255, 0.15);
    stroke-width: 1.5;
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
    animation: friend-draw 3s ease-in-out infinite;
}

.friend-line:nth-child(2) { animation-delay: 0.4s; }

@keyframes friend-draw {
    0%, 20% { stroke-dashoffset: 40; opacity: 0.3; }
    50%, 80% { stroke-dashoffset: 0; opacity: 1; }
    100% { stroke-dashoffset: -40; opacity: 0.3; }
}

.friend-node {
    position: absolute;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
}

.friend-logo {
    display: block;
    width: 1.1rem;
    height: 1.1rem;
    background: linear-gradient(135deg, #fef08a 0%, #eab308 100%);
    mask: url(/icons/icon.svg) center / contain no-repeat;
    -webkit-mask: url(/icons/icon.svg) center / contain no-repeat;
}

.friend-logo-t1 {
    background: linear-gradient(135deg, #6ee7b7 0%, #059669 100%);
}

.friend-logo-t2 {
    background: linear-gradient(135deg, #93c5fd 0%, #2563eb 100%);
}

.friend-logo-t3 {
    background: linear-gradient(135deg, #f9a8d4 0%, #db2777 100%);
}

.friend-node.n1 { left: 0; bottom: 0; }
.friend-node.n2 { left: 50%; top: 0; transform: translateX(-50%); }
.friend-node.n3 { right: 0; bottom: 0; }

.friend-node.active {
    border-color: rgba(34, 197, 94, 0.5);
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.25);
    animation: friend-active 2s ease-in-out infinite;
}

@keyframes friend-active {
    0%, 100% { transform: translateX(-50%) scale(1); }
    50% { transform: translateX(-50%) scale(1.06); }
}

.friend-dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 9999px;
    border: 1.5px solid #0d0d0d;
}

.friend-dot.idle { background: #6b7280; }
.friend-dot.online { background: #3b82f6; animation: friend-pulse 2s ease-in-out infinite; }
.friend-dot.watching { background: #22c55e; animation: friend-pulse 1.2s ease-in-out infinite; }

@keyframes friend-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45); }
    50% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0); }
}

.friend-play {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.85rem;
    line-height: 1;
    color: rgba(34, 197, 94, 0.35);
    pointer-events: none;
    animation: friend-play-ring 2s ease-in-out infinite;
}

@keyframes friend-play-ring {
    0%, 100% { transform: scale(0.88); opacity: 0.3; }
    50% { transform: scale(1); opacity: 0.6; }
}

.friend-status {
    position: absolute;
    left: 50%;
    bottom: -0.15rem;
    transform: translateX(-50%);
    margin: 0;
    font-size: 0.5rem;
    font-weight: 600;
    color: #4ade80;
    white-space: nowrap;
    animation: friend-status 3s ease-in-out infinite;
}

@keyframes friend-status {
    0%, 25%, 100% { opacity: 0; transform: translateX(-50%) translateY(2px); }
    40%, 70% { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ── AI ── */
.scene-ai { padding: 0.5rem; }

.ai-stack {
    position: relative;
    width: 100%;
    max-width: 9rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.ai-spark {
    position: absolute;
    width: 3px;
    height: 3px;
    border-radius: 9999px;
    background: #fff;
    opacity: 0;
    animation: ai-spark 2.5s ease-in-out infinite;
}

.ai-spark.s1 { top: 5%; right: 10%; animation-delay: 0s; }
.ai-spark.s2 { top: 20%; left: 5%; animation-delay: 0.8s; }
.ai-spark.s3 { bottom: 15%; right: 20%; animation-delay: 1.6s; }

@keyframes ai-spark {
    0%, 100% { opacity: 0; transform: scale(0); }
    50% { opacity: 0.9; transform: scale(1); }
}

.ai-bubble {
    padding: 0.4rem 0.55rem;
    border-radius: 0.65rem;
    font-size: 0.5rem;
    line-height: 1.3;
    border: 1px solid rgba(255, 255, 255, 0.12);
}

.ai-bubble-user {
    align-self: flex-end;
    max-width: 85%;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.08);
    animation: ai-user 4s ease-in-out infinite;
}

@keyframes ai-user {
    0%, 15%, 100% { opacity: 0; transform: translateY(4px); }
    25%, 85% { opacity: 1; transform: translateY(0); }
}

.ai-bubble-bot {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.1);
    animation: ai-bot 4s ease-in-out infinite;
}

@keyframes ai-bot {
    0%, 35%, 100% { opacity: 0; transform: translateY(4px); }
    45%, 90% { opacity: 1; transform: translateY(0); }
}

.ai-icon { font-size: 1rem; color: #f5f5f0; flex-shrink: 0; }

.ai-reply {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
}

.ai-reply-line {
    display: block;
    height: 3px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.35);
    transform-origin: left;
    animation: ai-type 4s ease-in-out infinite;
}

.ai-reply-line.w1 { width: 2.5rem; }
.ai-reply-line.w2 { width: 1.75rem; animation-delay: 0.15s; }

@keyframes ai-type {
    0%, 45%, 100% { transform: scaleX(0); opacity: 0; }
    55%, 90% { transform: scaleX(1); opacity: 1; }
}

/* ── Player ── */
.scene-player { padding: 0.5rem; }

.player-mini {
    width: 100%;
    max-width: 9.5rem;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.5);
}

.player-mini-screen {
    height: 2.5rem;
    background: linear-gradient(160deg, #1f2937 0%, #374151 50%, #111827 100%);
    animation: player-screen 4s ease-in-out infinite;
}

@keyframes player-screen {
    0%, 100% { filter: brightness(0.85); }
    50% { filter: brightness(1.05); }
}

.player-mini-track {
    position: relative;
    height: 3px;
    background: rgba(255, 255, 255, 0.15);
}

.player-mini-buffer {
    position: absolute;
    inset: 0 auto 0 0;
    width: 70%;
    background: rgba(255, 255, 255, 0.22);
}

.player-mini-progress {
    position: absolute;
    inset: 0 auto 0 0;
    width: 35%;
    background: #fff;
    animation: player-scrub 3.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes player-scrub {
    0%, 100% { width: 22%; }
    40% { width: 55%; }
    70% { width: 78%; }
}

.player-mini-thumb {
    position: absolute;
    right: 0;
    top: 50%;
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 9999px;
    background: #fff;
    transform: translate(50%, -50%);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
}

.player-mini-toolbar {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.45rem;
    font-size: 0.5rem;
    color: #fff;
}

.player-mini-btn { font-size: 0.875rem; }

.player-mini-skip {
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    font-weight: 600;
    font-size: 0.4375rem;
    background: rgba(255, 255, 255, 0.12);
    animation: player-skip 3.5s ease-in-out infinite;
}

@keyframes player-skip {
    0%, 85%, 100% { opacity: 0.5; background: rgba(255, 255, 255, 0.12); }
    88%, 95% { opacity: 1; background: rgba(255, 255, 255, 0.28); }
}

.player-mini-speed {
    margin-left: auto;
    padding: 0.1rem 0.35rem;
    border-radius: 9999px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    background: rgba(255, 255, 255, 0.12);
}

/* ── Schedule ── */
.scene-schedule { padding: 0.5rem; }

.schedule-wrap {
    width: 100%;
    max-width: 9.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
}

.schedule-days {
    position: relative;
    display: flex;
    justify-content: flex-start;
    gap: 0.2rem;
    width: fit-content;
    margin-inline: auto;
}

.schedule-highlight {
    position: absolute;
    top: 0;
    left: 0;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 9999px;
    background: #f5f5f0;
    animation: schedule-slide 5.6s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    z-index: 0;
    pointer-events: none;
}

@keyframes schedule-slide {
    0%, 100% { transform: translateX(0); }
    14% { transform: translateX(calc(1 * (1.35rem + 0.2rem))); }
    28% { transform: translateX(calc(2 * (1.35rem + 0.2rem))); }
    42% { transform: translateX(calc(3 * (1.35rem + 0.2rem))); }
    57% { transform: translateX(calc(4 * (1.35rem + 0.2rem))); }
    71% { transform: translateX(calc(5 * (1.35rem + 0.2rem))); }
    85% { transform: translateX(calc(6 * (1.35rem + 0.2rem))); }
}

.schedule-day {
    position: relative;
    z-index: 1;
    width: 1.35rem;
    height: 1.35rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    font-size: 0.5625rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.55);
    animation: schedule-day-text 5.6s ease-in-out infinite;
}

.schedule-day:nth-child(2) { animation-delay: 0s; }
.schedule-day:nth-child(3) { animation-delay: 0.784s; }
.schedule-day:nth-child(4) { animation-delay: 1.568s; }
.schedule-day:nth-child(5) { animation-delay: 2.352s; }
.schedule-day:nth-child(6) { animation-delay: 3.136s; }
.schedule-day:nth-child(7) { animation-delay: 3.92s; }
.schedule-day:nth-child(8) { animation-delay: 4.704s; }

@keyframes schedule-day-text {
    0%, 10% { color: #0d0d0d; font-weight: 700; }
    16%, 100% { color: rgba(255, 255, 255, 0.55); font-weight: 600; }
}

.schedule-count {
    margin: 0;
    font-size: 0.5rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
}

.schedule-count-num {
    color: #f5f5f0;
    font-variant-numeric: tabular-nums;
    animation: schedule-count 5.6s ease-in-out infinite;
}

@keyframes schedule-count {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
}

.schedule-posters {
    display: flex;
    justify-content: center;
    gap: 0.35rem;
}

.schedule-poster {
    position: relative;
    width: 1.5rem;
    height: 2.15rem;
    border-radius: 0.25rem;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(160deg, #3f3f46 0%, #27272a 100%);
    animation: schedule-poster-in 5.6s ease-in-out infinite;
}

.schedule-poster.p1 { animation-delay: 0.2s; }
.schedule-poster.p2 { animation-delay: 0.9s; }
.schedule-poster.p3 { animation-delay: 1.6s; }

@keyframes schedule-poster-in {
    0%, 8%, 100% { opacity: 0.35; transform: translateY(2px) scale(0.95); }
    12%, 75% { opacity: 1; transform: translateY(0) scale(1); }
}

.schedule-poster-shine {
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.15) 50%, transparent 60%);
    animation: schedule-shine 2.5s ease-in-out infinite;
}

.schedule-poster.p2 .schedule-poster-shine { animation-delay: 0.6s; }
.schedule-poster.p3 .schedule-poster-shine { animation-delay: 1.2s; }

@keyframes schedule-shine {
    0%, 100% { transform: translateX(-100%); }
    50% { transform: translateX(100%); }
}

/* Copy */
.feature-copy {
    padding: 1.1rem 1.15rem 1.25rem;
}

.feature-copy-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
}

.feature-title {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.35;
    color: #0d0d0d;
}

.dark .feature-title {
    color: #f5f5f0;
}

.feature-badge {
    flex-shrink: 0;
    padding: 0.2rem 0.55rem;
    border-radius: 9999px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #0d0d0d;
    background: rgba(13, 13, 13, 0.08);
}

.dark .feature-badge {
    color: #f5f5f0;
    background: rgba(255, 255, 255, 0.12);
}

.feature-body {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    line-height: 1.55;
    color: #4a4a4a;
}

.dark .feature-body {
    color: #b0b0a8;
}

@media (prefers-reduced-motion: reduce) {
    .feature-card:hover {
        transform: none;
    }

    .feature-glyph,
    .resume-poster,
    .resume-bar-fill,
    .resume-cta,
    .resume-sync,
    .dl-fill,
    .dl-pct,
    .dl-done,
    .dl-foot-ing,
    .dl-foot-ok,
    .friend-line,
    .friend-node.active,
    .friend-dot,
    .friend-play,
    .friend-status,
    .ai-spark,
    .ai-bubble-user,
    .ai-bubble-bot,
    .ai-reply-line,
    .player-mini-screen,
    .player-mini-progress,
    .player-mini-skip,
    .schedule-highlight,
    .schedule-day,
    .schedule-count-num,
    .schedule-poster,
    .schedule-poster-shine {
        animation: none !important;
    }

    .friend-line { stroke-dashoffset: 0; opacity: 0.6; }
    .dl-fill { width: 100%; background: #4ade80; }
    .dl-pct,
    .dl-foot-ing { opacity: 0; }
    .dl-done,
    .dl-foot-ok { opacity: 1; transform: none; }
    .ai-bubble-user,
    .ai-bubble-bot { opacity: 1; transform: none; }
    .ai-reply-line { transform: scaleX(1); opacity: 1; }
}
</style>
