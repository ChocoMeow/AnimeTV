// Shared utility for field type inference and conversion

// Infer field types from actual data samples
export async function getFieldTypesFromData(client, tableName, fields) {
    const fieldTypes = {}
    
    // Try to get multiple sample rows to better infer types
    let sampleRows = []
    try {
        const { data } = await client
            .from(tableName)
            .select('*')
            .limit(10)
        sampleRows = data || []
    } catch (error) {
        console.error('Error fetching sample rows for type inference:', error)
        sampleRows = []
    }

    // Analyze all sample rows to determine types
    for (const field of fields) {
        let detectedType = null
        
        // Check all sample rows for this field
        for (const row of sampleRows || []) {
            const value = row[field]
            if (value === null || value === undefined) continue
            
            // Array detection
            if (Array.isArray(value)) {
                detectedType = 'array'
                break
            }
            
            // Number detection
            if (typeof value === 'number') {
                const isInt = Number.isInteger(value)
                if (!detectedType) {
                    detectedType = isInt ? 'number' : 'double'
                } else if (detectedType === 'number' && !isInt) {
                    // If we found a decimal, upgrade to double
                    detectedType = 'double'
                }
                continue
            }
            
            // Boolean detection
            if (typeof value === 'boolean') {
                detectedType = 'boolean'
                break
            }
            
            // String detection - check for datetime patterns
            if (typeof value === 'string') {
                // Check if it's a datetime string (ISO format or common patterns)
                const datePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/
                if (datePattern.test(value) && (field.includes('date') || field.includes('time') || field.includes('_at'))) {
                    detectedType = 'datetime'
                    break
                }
                
                // Check if it's a long text (description field)
                if (field === 'description' || value.length > 100) {
                    detectedType = 'textbox'
                    continue
                }
                
                // Default to text
                if (!detectedType) {
                    detectedType = 'text'
                }
            }
        }
        
        // Apply smart defaults based on field name patterns
        if (!detectedType) {
            if (field.includes('date') || field.includes('time') || field.endsWith('_at')) {
                detectedType = 'datetime'
            } else if (field === 'description') {
                detectedType = 'textbox'
            } else if (field === 'id' || (field.includes('_id') && !field.includes('source_ids'))) {
                detectedType = 'number'
            } else if (field.includes('score') || field.includes('rating')) {
                detectedType = 'double'
            } else if (field.includes('count') || field.includes('views') || field.includes('votes')) {
                detectedType = 'number'
            } else if (field.includes('tags') || (field.includes('ids') && field.includes('array'))) {
                detectedType = 'array'
            } else {
                detectedType = 'text'
            }
        }
        
        fieldTypes[field] = detectedType
    }
    
    return fieldTypes
}

// Convert value based on field type
export function convertValue(value, fieldType) {
    if (value === null || value === undefined || value === '') {
        return null
    }

    switch (fieldType) {
        case 'number':
            const num = Number(value)
            return isNaN(num) ? null : Math.floor(num)
        case 'double':
            const dbl = Number(value)
            return isNaN(dbl) ? null : Math.round(dbl * 10) / 10 // Round to 1 decimal place
        case 'array':
            if (Array.isArray(value)) {
                // Return null if array is empty, otherwise return the array
                return value.length === 0 ? null : value
            }
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value)
                    if (Array.isArray(parsed)) {
                        return parsed.length === 0 ? null : parsed
                    }
                    return [value]
                } catch {
                    const arr = value.split(',').map(s => s.trim()).filter(Boolean)
                    return arr.length === 0 ? null : arr
                }
            }
            return null
        case 'datetime':
            if (value instanceof Date) return value.toISOString()
            if (typeof value === 'string') {
                const date = new Date(value)
                return isNaN(date.getTime()) ? null : date.toISOString()
            }
            return null
        case 'boolean':
            if (typeof value === 'boolean') return value
            if (typeof value === 'string') {
                const lower = value.toLowerCase()
                return lower === 'true' || lower === '1' || lower === 'yes'
            }
            return Boolean(value)
        case 'textbox':
        case 'text':
        default:
            return String(value)
    }
}

// Convert entire body based on field types
export function convertBody(body, fieldTypes) {
    const converted = {}
    for (const [key, value] of Object.entries(body)) {
        const fieldType = fieldTypes[key] || 'text'
        converted[key] = convertValue(value, fieldType)
    }
    return converted
}
