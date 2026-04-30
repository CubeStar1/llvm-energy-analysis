"use client";

import Editor from "@monaco-editor/react";

type MonacoEditorProps = {
  code: string;
  onChange: (value: string) => void;
};

export function MonacoEditor({ code, onChange }: MonacoEditorProps) {
  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-border/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <Editor
        height="28rem"
        defaultLanguage="cpp"
        value={code}
        onChange={(value) => onChange(value ?? "")}
        theme="vs-light"
        options={{
          automaticLayout: true,
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          minimap: { enabled: false },
          padding: { top: 18, bottom: 18 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
        }}
      />
    </div>
  );
}
