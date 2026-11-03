export const FIELDS = ["x", "y", "w", "h", "rotate", "color", "text", "domain", "layer"];

export const initialState = { items: [], past: [], future: [] };

export function newId() {
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  const random = [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, "0"));
  return time + random.join("");
}

export function applyChange(items, change, forward) {
  const target = forward ? change.after : change.before;
  const source = forward ? change.before : change.after;
  if (target === null) return items.filter((item) => item.id !== change.id);
  if (source === null) return [...items.filter((item) => item.id !== change.id), target];
  return items.map((item) => (item.id === change.id ? { ...item, ...target } : item));
}

function applyRemote(items, event, payload) {
  if (event === "item:created") return [...items.filter((item) => item.id !== payload.item.id), payload.item];
  if (event === "item:deleted") return items.filter((item) => item.id !== payload.itemId);
  const changed = new Map(payload.items.map((item) => [item.id, item]));
  return items.map((item) => changed.get(item.id) ?? item);
}

export function boardReducer(state, action) {
  switch (action.type) {
    case "load":
      return { ...state, items: action.items };
    case "patch":
      return {
        ...state,
        items: state.items.map((item) => (action.patches[item.id] ? { ...item, ...action.patches[item.id] } : item)),
      };
    case "record":
      return { ...state, past: [...state.past, action.changes], future: [] };
    case "do":
      return {
        items: action.changes.reduce((items, change) => applyChange(items, change, true), state.items),
        past: [...state.past, action.changes],
        future: [],
      };
    case "undo": {
      const entry = state.past.at(-1);
      if (!entry) return state;
      return {
        items: [...entry].reverse().reduce((items, change) => applyChange(items, change, false), state.items),
        past: state.past.slice(0, -1),
        future: [entry, ...state.future],
      };
    }
    case "redo": {
      const [entry, ...future] = state.future;
      if (!entry) return state;
      return {
        items: entry.reduce((items, change) => applyChange(items, change, true), state.items),
        past: [...state.past, entry],
        future,
      };
    }
    case "remote":
      return { ...state, items: applyRemote(state.items, action.event, action.payload) };
    default:
      return state;
  }
}

const toPayload = (item) => ({ id: item.id, type: item.type, ...Object.fromEntries(FIELDS.map((key) => [key, item[key]])) });

export function opsFor(changes, forward) {
  const ops = { creates: [], updates: [], deletes: [] };
  for (const change of changes) {
    const target = forward ? change.after : change.before;
    const source = forward ? change.before : change.after;
    if (target === null) ops.deletes.push(change.id);
    else if (source === null) ops.creates.push(toPayload(target));
    else ops.updates.push({ itemId: change.id, changes: target });
  }
  return ops;
}
