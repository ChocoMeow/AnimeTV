import { listAnimeMeta } from '~~/server/services/admin.service.js'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const query = getQuery(event)

    const page = Number.parseInt(query.page) > 0 ? Number.parseInt(query.page) : 1
    const pageSize = Number.parseInt(query.pageSize) > 0 ? Number.parseInt(query.pageSize) : 50
    const search = typeof query.search === 'string' ? query.search.trim() : ''
    const field = typeof query.field === 'string' ? query.field.trim() : ''
    const operator = (typeof query.operator === 'string' ? query.operator.trim().toLowerCase() : 'eq') || 'eq'
    const orderBy = typeof query.orderBy === 'string' ? query.orderBy.trim() : 'updated_at'
    const order = (typeof query.order === 'string' ? query.order.trim().toLowerCase() : 'desc') || 'desc'

    return listAnimeMeta(event, { page, pageSize, search, field, operator, orderBy, order })
})
