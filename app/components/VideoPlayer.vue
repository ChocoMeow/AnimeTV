<script setup>
/**
 * Public entry for <VideoPlayer />.
 * Implementation lives in ./player/VideoPlayer.vue
 */
import PlayerRoot from './player/VideoPlayer.vue'

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const playerRef = ref(null)

defineExpose({
    get videoElement() { return playerRef.value?.videoElement },
    get currentTime() { return playerRef.value?.currentTime },
    get duration() { return playerRef.value?.duration },
    get isPlaying() { return playerRef.value?.isPlaying },
    get volume() { return playerRef.value?.volume },
    play: (...args) => playerRef.value?.play?.(...args),
    pause: (...args) => playerRef.value?.pause?.(...args),
    seek: (...args) => playerRef.value?.seek?.(...args),
    setVolume: (...args) => playerRef.value?.setVolume?.(...args),
})
</script>

<template>
    <PlayerRoot ref="playerRef" v-bind="attrs" />
</template>
