<script setup>
import { WELCOME_FEATURES as features } from '~/features/welcome/data/features'
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

<style scoped src="../styles/WelcomeFeatureShowcase.css"></style>
