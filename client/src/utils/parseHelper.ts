export const parseInto = <T>(
  data: string, 
  fallback: T | (() => T)
): T => {
  try {
    return JSON.parse(data) as T;
  } catch (e) {
    return typeof fallback === 'function' 
      ? (fallback as () => T)() 
      : fallback;
  }
};