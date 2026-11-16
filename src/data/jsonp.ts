/**
 * JSONP / script 注入加载器。
 * 腾讯行情与新浪 K 线均通过 <script> 直连（无 CORS 限制），与参考站机制一致。
 */

export function loadScript(url: string, opts: { charset?: string; timeoutMs?: number } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    if (opts.charset) s.charset = opts.charset;
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`script timeout: ${url.slice(0, 80)}`));
    }, opts.timeoutMs ?? 15000);
    const cleanup = () => {
      window.clearTimeout(timer);
      s.onload = null;
      s.onerror = null;
      s.remove();
    };
    s.onload = () => {
      cleanup();
      resolve();
    };
    s.onerror = () => {
      cleanup();
      reject(new Error(`script error: ${url.slice(0, 80)}`));
    };
    document.head.appendChild(s);
  });
}

let seq = 0;

/**
 * 新浪 K 线 JSONP：callback 名写进 URL 路径段 `var <name>=`，响应形如 `var <name>=([...]);`
 */
export async function fetchSinaJsonp<T>(apiPath: string, params: string, timeoutMs = 15000): Promise<T> {
  const cb = `__sinaCb${++seq}`;
  const url = `https://quotes.sina.cn/cn/api/jsonp_v2.php/${encodeURIComponent(`var ${cb}=`)}/${apiPath}?${params}`;
  await loadScript(url, { timeoutMs });
  const w = window as unknown as Record<string, unknown>;
  const data = w[cb];
  // 严格模式下 var 声明的全局属性不可 delete，覆盖置空即可
  try {
    delete w[cb];
  } catch {
    w[cb] = undefined;
  }
  if (data == null) throw new Error(`sina jsonp empty: ${apiPath}`);
  return data as T;
}

/** 带并发上限的批量执行，逐个回报进度 */
export async function poolAll<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ results: (R | null)[]; errors: (Error | null)[] }> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  const errors: (Error | null)[] = new Array(items.length).fill(null);
  let cursor = 0;
  let done = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        errors[i] = e instanceof Error ? e : new Error(String(e));
      }
      done++;
      onProgress?.(done, items.length);
    }
  });
  await Promise.all(runners);
  return { results, errors };
}
