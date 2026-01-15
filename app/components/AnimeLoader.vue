<script setup>
defineProps({
    show: {
        type: Boolean,
        default: true,
    },
    message: {
        type: String,
        default: "",
    },
    showProgress: {
        type: Boolean,
        default: false,
    },
    centered: {
        type: Boolean,
        default: false,
    },
})
</script>

<template>
    <div v-if="show" :class="[centered ? 'relative' : 'fixed top-4 right-4', 'flex items-center justify-center', centered ? 'p-8' : 'bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-xl shadow-lg p-6']">
        <div class="flex flex-col items-center gap-4">
            <!-- Animated TV Icon -->
            <div class="relative">
                <!-- Main TV body with bounce animation -->
                <div class="animate-bounce-slow">
                    <svg :width="centered ? 100 : 80" :height="centered ? 110 : 88" viewBox="0 0 120 110" fill="none" xmlns="http://www.w3.org/2000/svg" class="tv-icon">
                        <!-- Antennas -->
                        <g class="animate-antenna-left antenna">
                            <line x1="45" y1="25" x2="35" y2="10" stroke-width="4" stroke-linecap="round" />
                            <circle cx="35" cy="10" r="6" />
                        </g>
                        <g class="animate-antenna-right antenna">
                            <line x1="75" y1="25" x2="85" y2="10" stroke-width="4" stroke-linecap="round" />
                            <circle cx="85" cy="10" r="6" />
                        </g>

                        <!-- TV Body -->
                        <rect x="20" y="30" width="80" height="70" rx="12" class="tv-body" />

                        <!-- Screen -->
                        <rect x="30" y="40" width="60" height="40" rx="8" class="tv-screen" />

                        <!-- Angry Eyes -->
                        <g class="animate-blink">
                            <!-- Left Eye -->
                            <ellipse cx="48" cy="60" rx="8" ry="10" class="eye-white" />
                            <ellipse cx="50" cy="62" rx="5" ry="6" class="eye-pupil" />
                            <circle cx="51" cy="61" r="2" class="eye-shine" />

                            <!-- Right Eye -->
                            <ellipse cx="72" cy="60" rx="8" ry="10" class="eye-white" />
                            <ellipse cx="70" cy="62" rx="5" ry="6" class="eye-pupil" />
                            <circle cx="69" cy="61" r="2" class="eye-shine" />
                        </g>

                        <!-- Eyebrows -->
                        <path d="M 40 52 Q 48 48 56 52" stroke-width="3" stroke-linecap="round" fill="none" class="eyebrow" />
                        <path d="M 64 52 Q 72 48 80 52" stroke-width="3" stroke-linecap="round" fill="none" class="eyebrow" />
                    </svg>
                </div>
            </div>

            <!-- Loading Text -->
            <div class="flex flex-col items-center gap-1.5">
                <p :class="[centered ? 'text-lg' : 'text-sm', 'font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1']">
                    載入中
                    <span class="flex gap-0.5">
                        <span class="dot1">.</span>
                        <span class="dot2">.</span>
                        <span class="dot3">.</span>
                    </span>
                </p>
                <p v-if="message" :class="[centered ? 'text-sm' : 'text-xs', 'text-gray-600 dark:text-gray-400']">{{ message }}</p>
            </div>

            <!-- Progress Bar (optional) -->
            <div v-if="showProgress" :class="[centered ? 'w-80' : 'w-64', 'h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden']">
                <div class="h-full bg-gradient-to-r from-gray-600 to-gray-800 dark:from-gray-400 dark:to-gray-600 animate-progress rounded-full"></div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* SVG Element Colors - Adapts to theme */
.tv-icon .antenna line {
    stroke: rgb(75 85 99); /* gray-600 */
}

.tv-icon .antenna circle {
    fill: rgb(75 85 99); /* gray-600 */
}

.tv-icon .tv-body {
    fill: rgb(209 213 219); /* gray-300 */
}

.tv-icon .tv-screen {
    fill: rgb(243 244 246); /* gray-100 */
}

.tv-icon .eye-white {
    fill: white;
}

.tv-icon .eye-pupil {
    fill: rgb(71 85 105); /* slate-600 */
}

.tv-icon .eye-shine {
    fill: white;
}

.tv-icon .eyebrow {
    stroke: rgb(71 85 105); /* slate-600 */
}

/* Dark mode colors */
:global(.dark) .tv-icon .antenna line {
    stroke: rgb(156 163 175); /* gray-400 */
}

:global(.dark) .tv-icon .antenna circle {
    fill: rgb(156 163 175); /* gray-400 */
}

:global(.dark) .tv-icon .tv-body {
    fill: rgb(55 65 81); /* gray-700 */
}

:global(.dark) .tv-icon .tv-screen {
    fill: rgb(31 41 55); /* gray-800 */
}

:global(.dark) .tv-icon .eye-white {
    fill: rgb(226 232 240); /* slate-200 */
}

:global(.dark) .tv-icon .eye-pupil {
    fill: rgb(15 23 42); /* slate-900 */
}

:global(.dark) .tv-icon .eyebrow {
    stroke: rgb(15 23 42); /* slate-900 */
}

@keyframes bounce-slow {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(-10px);
    }
}

@keyframes antenna-wiggle-left {
    0%,
    100% {
        transform: rotate(0deg);
    }
    25% {
        transform: rotate(-15deg);
    }
    75% {
        transform: rotate(10deg);
    }
}

@keyframes antenna-wiggle-right {
    0%,
    100% {
        transform: rotate(0deg);
    }
    25% {
        transform: rotate(15deg);
    }
    75% {
        transform: rotate(-10deg);
    }
}

@keyframes spin-slow {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@keyframes blink {
    0%,
    90%,
    100% {
        opacity: 1;
    }
    95% {
        opacity: 0;
    }
}

@keyframes progress {
    0% {
        width: 0%;
    }
    50% {
        width: 70%;
    }
    100% {
        width: 100%;
    }
}

@keyframes dot-flash {
    0%,
    50%,
    100% {
        opacity: 1;
    }
    25% {
        opacity: 0.4;
    }
}

.animate-bounce-slow {
    animation: bounce-slow 2s ease-in-out infinite;
}

.animate-antenna-left {
    animation: antenna-wiggle-left 1.5s ease-in-out infinite;
    transform-origin: 45px 25px;
}

.animate-antenna-right {
    animation: antenna-wiggle-right 1.5s ease-in-out infinite;
    transform-origin: 75px 25px;
}

.animate-blink {
    animation: blink 3s ease-in-out infinite;
}

.animate-progress {
    animation: progress 2s ease-in-out infinite;
}

.dot1 {
    animation: dot-flash 1.4s infinite 0s;
}
.dot2 {
    animation: dot-flash 1.4s infinite 0.2s;
}
.dot3 {
    animation: dot-flash 1.4s infinite 0.4s;
}
</style>
