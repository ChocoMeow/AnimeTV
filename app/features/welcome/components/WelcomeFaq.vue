<script setup>
import { welcomeFaqs } from '~/features/welcome/data/faqs'

const appConfig = useAppConfig()
const faqs = computed(() => welcomeFaqs(appConfig.siteName))

const openItems = ref(new Set([0]))

function toggle(i) {
    const next = new Set(openItems.value)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    openItems.value = next
}
</script>

<template>
    <div class="faq-list">
        <article
            v-for="(item, i) in faqs"
            :key="item.q"
            class="faq-item"
            :class="{ 'faq-item--open': openItems.has(i) }"
        >
            <button
                type="button"
                class="faq-question"
                :aria-expanded="openItems.has(i)"
                @click="toggle(i)"
            >
                <span class="faq-question-text">{{ item.q }}</span>
                <span class="material-symbols-rounded faq-icon" aria-hidden="true">expand_more</span>
            </button>
            <div class="faq-body" :class="{ 'faq-body--open': openItems.has(i) }">
                <div class="faq-body-inner">
                    <p class="faq-answer">{{ item.a }}</p>
                </div>
            </div>
        </article>
    </div>
</template>

<style scoped>
.faq-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    width: 100%;
}

.faq-item {
    width: 100%;
    border-radius: 0.875rem;
    border: 1.5px solid rgba(13, 13, 13, 0.1);
    background: rgba(255, 255, 255, 0.65);
    backdrop-filter: blur(6px);
    overflow: hidden;
    transition:
        border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .faq-item {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
}

.faq-item--open {
    border-color: rgba(13, 13, 13, 0.18);
    box-shadow: 0 8px 24px -12px rgba(13, 13, 13, 0.12);
}

.dark .faq-item--open {
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.35);
}

.faq-question {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 1rem 1.15rem;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.45;
    text-align: left;
    color: #0d0d0d;
    background: transparent;
    border: none;
    cursor: pointer;
    user-select: none;
}

.dark .faq-question {
    color: #f5f5f0;
}

.faq-question:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px rgba(13, 13, 13, 0.35);
}

.dark .faq-question:focus-visible {
    box-shadow: inset 0 0 0 2px rgba(245, 245, 240, 0.35);
}

.faq-question-text {
    flex: 1;
    min-width: 0;
}

.faq-icon {
    flex-shrink: 0;
    font-size: 1.25rem;
    color: #6b6b6b;
    transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .faq-icon {
    color: #9a9a92;
}

.faq-item--open .faq-icon {
    transform: rotate(180deg);
}

.faq-body {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.faq-body--open {
    grid-template-rows: 1fr;
}

.faq-body-inner {
    overflow: hidden;
    min-height: 0;
}

.faq-answer {
    margin: 0;
    padding: 0 1.15rem 1.1rem;
    font-size: 0.875rem;
    line-height: 1.65;
    color: #4a4a4a;
    opacity: 0;
    transform: translateY(-0.35rem);
    transition:
        opacity 0.3s cubic-bezier(0.22, 1, 0.36, 1),
        transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.faq-body--open .faq-answer {
    opacity: 1;
    transform: translateY(0);
}

.dark .faq-answer {
    color: #b0b0a8;
}

@media (prefers-reduced-motion: reduce) {
    .faq-item,
    .faq-icon,
    .faq-body,
    .faq-answer {
        transition: none !important;
    }

    .faq-body:not(.faq-body--open) .faq-answer {
        opacity: 0;
    }

    .faq-body--open .faq-answer {
        opacity: 1;
        transform: none;
    }
}
</style>
