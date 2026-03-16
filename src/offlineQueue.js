const QUEUE_KEY = "barcode_offline_queue_v1";
const CACHE_KEY = "barcode_items_cache_v1";

const safeParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const readQueue = () => {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(QUEUE_KEY) || "[]", []);
};

const writeQueue = (queue) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

const readCache = () => {
  if (typeof window === "undefined") return {};
  return safeParse(localStorage.getItem(CACHE_KEY) || "{}", {});
};

const writeCache = (cache) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

export const loadCachedItems = (householdId) => {
  const cache = readCache();
  return Array.isArray(cache[householdId]) ? cache[householdId] : [];
};

export const saveCachedItems = (householdId, items) => {
  const cache = readCache();
  cache[householdId] = items;
  writeCache(cache);
};

export const enqueueAction = (action) => {
  const queue = readQueue();
  queue.push(action);
  writeQueue(queue);
};

export const clearQueue = () => {
  writeQueue([]);
};

export const getQueueLength = () => readQueue().length;

export const applyLocalMutation = (items, action) => {
  if (!action) return items;
  if (action.type === "create_item") {
    const payload = action.payload || {};
    const id = payload.id || payload.client_id;
    return [{ ...payload, id, pending: true }, ...items];
  }
  if (action.type === "update_item") {
    return items.map((item) =>
      item.id === action.payload.id
        ? { ...item, ...action.payload.updates, pending: item.pending }
        : item
    );
  }
  if (action.type === "delete_items") {
    const ids = new Set(action.payload.ids);
    return items.filter((item) => !ids.has(item.id));
  }
  return items;
};

export const flushQueue = async (supabase) => {
  const queue = readQueue();
  if (!queue.length) return { flushed: 0, remaining: 0 };

  const cacheMap = {};
  const getCache = (householdId) => {
    if (!cacheMap[householdId]) {
      cacheMap[householdId] = loadCachedItems(householdId);
    }
    return cacheMap[householdId];
  };

  const setCache = (householdId, items) => {
    cacheMap[householdId] = items;
  };

  const remaining = [];
  let flushed = 0;

  for (const action of queue) {
    const householdId = action.payload?.household_id;
    try {
      if (action.type === "create_item") {
        const { client_id, pending, ...insertData } = action.payload;
        const { data, error } = await supabase
          .from("items")
          .insert([insertData])
          .select("*")
          .single();
        if (error) throw error;
        let itemsCache = getCache(householdId);
        itemsCache = itemsCache.filter((item) => item.client_id !== client_id);
        itemsCache = [data, ...itemsCache];
        setCache(householdId, itemsCache);
      }

      if (action.type === "update_item") {
        const { id, updates } = action.payload;
        const { error } = await supabase.from("items").update(updates).eq("id", id);
        if (error) throw error;
        let itemsCache = getCache(householdId);
        itemsCache = itemsCache.map((item) =>
          item.id === id ? { ...item, ...updates, pending: item.pending } : item
        );
        setCache(householdId, itemsCache);
      }

      if (action.type === "delete_items") {
        const { ids } = action.payload;
        const { error } = await supabase.from("items").delete().in("id", ids);
        if (error) throw error;
        let itemsCache = getCache(householdId);
        const idSet = new Set(ids);
        itemsCache = itemsCache.filter((item) => !idSet.has(item.id));
        setCache(householdId, itemsCache);
      }

      flushed += 1;
    } catch (error) {
      console.warn("Failed to flush queued action", action, error);
      remaining.push(action);
    }
  }

  writeQueue(remaining);
  Object.entries(cacheMap).forEach(([householdId, items]) => {
    saveCachedItems(householdId, items);
  });

  return { flushed, remaining: remaining.length };
};

export const generateClientId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
