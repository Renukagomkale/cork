import { Link2 } from "lucide-react";
import { useState } from "react";

const darkText = ["sunflower", "sage", "paper"];

function NoteEditor({ item, onFinish }) {
  const [value, setValue] = useState(item.text);
  return (
    <textarea
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onFinish(item.id, value)}
      onPointerDown={(event) => event.stopPropagation()}
      className="h-full w-full resize-none bg-transparent p-4 text-lg font-medium leading-snug outline-none"
    />
  );
}

export default function ItemView({ item, selected, lifted, editing, onPointerDown, onStartEdit, onFinishEdit, onResizeStart }) {
  const textColor = darkText.includes(item.color) ? "text-ink" : "text-paper";

  return (
    <div
      onPointerDown={(event) => onPointerDown(event, item)}
      onDoubleClick={item.type === "note" ? () => onStartEdit(item.id) : undefined}
      className="absolute left-0 top-0 touch-none select-none"
      style={{ width: item.w, height: item.h, transform: `translate(${item.x}px, ${item.y}px)` }}
    >
      <div
        className={`h-full w-full overflow-hidden rounded-[3px] transition-[transform,box-shadow] duration-150 ${textColor} ${
          selected ? "outline-2 outline-offset-4 outline-cobalt" : ""
        }`}
        style={{
          background: `var(--color-${item.color})`,
          transform: `rotate(${item.rotate + (lifted ? -1.5 : 0)}deg) scale(${lifted ? 1.04 : 1})`,
          boxShadow: lifted ? "0 22px 30px -14px rgb(35 38 43 / 0.5)" : "0 5px 10px -6px rgb(35 38 43 / 0.45)",
          outlineStyle: selected ? "solid" : "none",
        }}
      >
        {item.type === "note" &&
          (editing ? (
            <NoteEditor item={item} onFinish={onFinishEdit} />
          ) : (
            <p className="whitespace-pre-wrap p-4 text-lg font-medium leading-snug">{item.text}</p>
          ))}

        {item.type === "swatch" && (
          <div className="flex h-full flex-col bg-paper text-ink">
            <div className="flex-1" style={{ background: `var(--color-${item.color})` }} />
            <p className="p-3 text-sm font-medium">{item.text}</p>
          </div>
        )}

        {item.type === "link" && (
          <div className="flex h-full flex-col justify-between p-4">
            <Link2 size={16} />
            <div>
              <p className="text-xl font-semibold leading-tight">{item.text}</p>
              <p className="text-sm opacity-70">{item.domain}</p>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <span
          role="presentation"
          onPointerDown={(event) => onResizeStart(event, item)}
          className="absolute -bottom-3 -right-3 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-cobalt bg-paper"
        />
      )}
    </div>
  );
}
