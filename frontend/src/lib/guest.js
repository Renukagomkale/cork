const key = (boardId) => `cork.guest.${boardId}`;

export function guestSession(boardId) {
  try {
    return JSON.parse(localStorage.getItem(key(boardId)));
  } catch {
    return null;
  }
}

export const saveGuest = (boardId, session) => localStorage.setItem(key(boardId), JSON.stringify(session));
export const clearGuest = (boardId) => localStorage.removeItem(key(boardId));
