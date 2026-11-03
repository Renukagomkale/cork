const lightText = ["tomato", "cobalt"];

export default function Cursors({ peers, cursors, meId, scale }) {
  return peers
    .filter((person) => person.id !== meId && cursors[person.id])
    .map((person) => {
      const { x, y } = cursors[person.id];
      return (
        <div
          key={person.id}
          className="pointer-events-none absolute left-0 top-0"
          style={{
            transform: `translate(${x}px, ${y}px) scale(${1 / scale})`,
            transformOrigin: "0 0",
            transition: "transform 90ms linear",
            color: `var(--color-${person.color})`,
          }}
        >
          <svg width="18" height="22" viewBox="0 0 18 22" fill="currentColor">
            <path d="M2 2l12 9-5.5 1L6 18z" stroke="white" strokeWidth="1.2" />
          </svg>
          <span
            className="-mt-1 ml-4 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: "currentColor" }}
          >
            <span className={lightText.includes(person.color) ? "text-paper" : "text-ink"}>{person.name}</span>
          </span>
        </div>
      );
    });
}
