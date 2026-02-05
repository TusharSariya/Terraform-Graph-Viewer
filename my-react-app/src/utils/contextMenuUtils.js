/**
 * Recursively converts a JSON object or value into a structure suitable for the ContextMenu component.
 * 
 * @param {any} data - The data to convert (object, array, or primitive).
 * @param {string} [keyLabel] - Optional label for the current item (used for values).
 * @returns {Array} An array of menu items.
 */
export const generateMenuItems = (data, keyLabel = '') => {
    if (data === null || data === undefined) {
        return [{ label: keyLabel ? `${keyLabel}: Empty` : 'Empty', disabled: true }];
    }

    if (typeof data !== 'object') {
        // Primitive value
        return [{ label: keyLabel ? `${keyLabel}: ${data}` : String(data), onClick: () => navigator.clipboard.writeText(String(data)) }];
    }

    if (Array.isArray(data)) {
        if (data.length === 0) {
            return [{ label: keyLabel ? `${keyLabel}: []` : '[]', disabled: true }];
        }
        return data.map((item, index) => {
            if (typeof item !== 'object') {
                return { label: `${index}: ${item}`, onClick: () => navigator.clipboard.writeText(String(item)) };
            }
            return {
                label: `[${index}]`,
                subItems: generateMenuItems(item)
            };
        });
    }

    // Object
    const keys = Object.keys(data);
    if (keys.length === 0) {
        return [{ label: keyLabel ? `${keyLabel}: {}` : '{}', disabled: true }];
    }

    return keys.map(key => {
        const value = data[key];
        if (typeof value === 'object' && value !== null) {
            return {
                label: key,
                subItems: generateMenuItems(value)
            };
        } else {
            return {
                label: `${key}: ${value}`,
                onClick: () => navigator.clipboard.writeText(String(value))
            };
        }
    });
};
