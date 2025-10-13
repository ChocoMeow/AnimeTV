export const useApi = () => {
    const baseURL = '/api'

    const get = async (url) => {
        const { data } = await useFetch(`${baseURL}${url}`)
        return data.value
    }

    return { get }
}
