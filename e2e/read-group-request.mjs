// Only retry a transport failure of this idempotent GET. HTTP responses and
// persistence assertions still fail normally; both attempts share the old 30s budget.
export async function readGroupRequest(request, path, now = Date.now) {
  const deadline = now() + 30000;
  try {
    return await request.get(path, { timeout: 10000, maxRetries: 2 });
  } catch (error) {
    const remaining = deadline - now();
    const transportFailure = error?.name === 'TimeoutError' ||
      /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up/.test(error?.message ?? '');
    if (!transportFailure || remaining <= 0) throw error;
    return request.get(path, { timeout: remaining, maxRetries: 2 });
  }
}
