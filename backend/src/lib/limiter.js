export function createLimiter(max, windowMs) {
  let windowStart = Date.now();
  let count = 0;
  return {
    allow() {
      const now = Date.now();
      if (now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      return count <= max;
    },
  };
}
