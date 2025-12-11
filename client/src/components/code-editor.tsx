import { useRef, useCallback } from "react";
import Editor, { OnMount, BeforeMount } from "@monaco-editor/react";
import { useTheme } from "@/hooks/useTheme";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "java":
      return "java";
    case "xml":
      return "xml";
    case "json":
      return "json";
    case "yml":
    case "yaml":
      return "yaml";
    case "md":
      return "markdown";
    case "properties":
      return "properties";
    case "gradle":
      return "groovy";
    case "kt":
    case "kts":
      return "kotlin";
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "html":
      return "html";
    case "css":
      return "css";
    default:
      return "plaintext";
  }
}

export function CodeEditor({ value, onChange, language = "java", readOnly = false }: CodeEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<any>(null);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("auroracraft-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955" },
        { token: "keyword", foreground: "C586C0" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
        { token: "type", foreground: "4EC9B0" },
        { token: "function", foreground: "DCDCAA" },
        { token: "variable", foreground: "9CDCFE" },
        { token: "annotation", foreground: "DCDCAA" },
      ],
      colors: {
        "editor.background": "#0c0a09",
        "editor.foreground": "#D4D4D4",
        "editor.lineHighlightBackground": "#1c1917",
        "editor.selectionBackground": "#264F78",
        "editorCursor.foreground": "#AEAFAD",
        "editorWhitespace.foreground": "#3B3A32",
        "editorIndentGuide.background": "#292524",
        "editorIndentGuide.activeBackground": "#44403c",
        "editor.selectionHighlightBackground": "#2e2c2a",
        "editorBracketMatch.background": "#57534e50",
        "editorBracketMatch.border": "#57534e",
      },
    });

    monaco.editor.defineTheme("auroracraft-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#fafaf9",
        "editor.lineHighlightBackground": "#f5f5f4",
        "editorIndentGuide.background": "#e7e5e4",
        "editorIndentGuide.activeBackground": "#d6d3d1",
      },
    });
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Prevent default save behavior, handled by parent
    });

    editor.updateOptions({
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
      fontLigatures: true,
      minimap: { enabled: true, scale: 1.5, showSlider: "mouseover" },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      renderLineHighlight: "line",
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      wordWrap: "off",
      tabSize: 4,
      insertSpaces: true,
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },
      padding: { top: 8, bottom: 8 },
    });
  };

  const handleChange = useCallback((value: string | undefined) => {
    onChange(value || "");
  }, [onChange]);

  return (
    <div className="h-full w-full" data-testid="editor-monaco">
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        beforeMount={handleBeforeMount}
        theme={theme === "dark" ? "auroracraft-dark" : "auroracraft-light"}
        options={{
          readOnly,
        }}
        loading={
          <div className="h-full w-full flex items-center justify-center bg-background">
            <div className="text-sm text-muted-foreground">Loading editor...</div>
          </div>
        }
      />
    </div>
  );
}

export { getLanguageFromFilename };
