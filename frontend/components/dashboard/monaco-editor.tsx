"use client";

import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";

type MonacoEditorProps = {
  code: string;
  onChange: (value: string) => void;
};

export function MonacoEditor({ code, onChange }: MonacoEditorProps) {
  const { theme } = useTheme();
  const editorTheme = theme === "dark" ? "vs-dark" : "vs-light";
  return (
    <div className="flex-1 h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="cpp"
        value={code}
        onChange={(value) => onChange(value ?? "")}
        theme={editorTheme}
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
