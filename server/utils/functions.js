export function isValidNumberString(str) {
    return /^[+-]?\d+(\.\d+)?$/.test(str);
}