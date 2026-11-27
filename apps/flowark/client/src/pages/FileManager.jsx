import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, FileText, ArrowLeft, TerminalSquare, RefreshCw, X, Folder, Code, LayoutList, AlertTriangle } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useDashboard } from '../context/DashboardContext.jsx';
import { VisualConfigEditor } from '../components/files/VisualConfigEditor.jsx';

export function FileManager() {
  const { fileList, fileListLoading, fileListError, currentPath, editingFile, setEditingFile, editingContent, setEditingContent, fileReadLoading, fileReadError, fileReadTarget, savingFile, saveFile, fetchFiles, openFile, fileType, setFileType } = useDashboard();
  const [editorMode, setEditorMode] = useState('visual'); // 'visual' or 'code'
  const monacoRef = useRef(null);
  const saveFileHandlerRef = useRef(saveFile);
  const saveDisabled = savingFile || Boolean(editingFile?.redacted);

  useEffect(() => {
    saveFileHandlerRef.current = saveFile;
  }, [saveFile]);

  const handleEditorDidMount = (editor, monaco) => {
    monacoRef.current = editor;

    // Add custom keybinding for save (Ctrl+S or Cmd+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveFileHandlerRef.current();
    });
  };

  useEffect(() => {
    if (!editingFile) return undefined;

    const handleWindowKeyDown = event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            if (!saveDisabled) saveFileHandlerRef.current();
        }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [editingFile, saveDisabled]);

  const breadcrumbs = currentPath.split('/').filter(Boolean);
  const editingFilePath = editingFile?.path || editingFile?.name || '';
  const editingFileDirectory = editingFilePath.includes('/')
      ? editingFilePath.split('/').slice(0, -1).join('/') || '.'
      : currentPath || '.';

  const navigateBreadcrumb = (index) => {
      const newPath = breadcrumbs.slice(0, index + 1).join('/');
      fetchFiles(newPath || '.');
      setEditingFile(null);
  };

  const navigateBack = () => {
      const parts = currentPath.split('/');
      parts.pop();
      fetchFiles(parts.join('/') || '.');
      setEditingFile(null);
  };

  const closeEditor = () => {
      setEditingFile(null);
  };

  // Determine the language based on file extension
  const getLanguage = (filename) => {
      if (!filename) return 'plaintext';
      if (filename.endsWith('.ini')) return 'ini';
      if (filename.endsWith('.json')) return 'json';
      return 'plaintext';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 overflow-hidden"
    >
        {/* Cabecera y Controles Principales */}
        <div className="flex shrink-0 flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <TerminalSquare className="text-indigo-400" />
                    Gestor de Archivos
                </h2>
                <p className="text-sm text-zinc-500 mt-1">Navega y edita los archivos de configuración del servidor con precisión.</p>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
                <select
                    value={fileType}
                    onChange={(e) => {
                        const nextFileType = e.target.value;
                        setEditingFile(null);
                        setFileType(nextFileType);
                        fetchFiles('.', nextFileType);
                    }}
                    className="min-w-0 flex-1 bg-[#18181b] border border-zinc-800 text-zinc-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors sm:flex-none"
                >
                    <option value="game">Archivos del Juego (.ini)</option>
                    <option value="lgsm">Archivos de Servidor (.cfg)</option>
                </select>
                <button
                    onClick={() => fetchFiles(currentPath)}
                    disabled={fileListLoading}
                    className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-zinc-800 bg-[#18181b] p-2 text-zinc-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    title="Actualizar directorio"
                >
                    <RefreshCw size={18} className={fileListLoading ? 'animate-spin' : ''} />
                </button>
                {editingFile && (
                    <button
                        onClick={saveFile}
                        disabled={saveDisabled}
                        title={editingFile?.redacted ? 'Este archivo contiene secretos redactados. Usa la rotación segura de secretos.' : 'Guardar cambios'}
                        aria-describedby={editingFile?.redacted ? 'file-redacted-save-warning' : undefined}
                        className="flex w-full items-center justify-center gap-2 bg-indigo-500 hover:bg-[#4f7aff] px-4 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-colors text-sm text-white sm:w-auto"
                    >
                        <Save size={16}/> {savingFile ? 'Guardando...' : <><span>Guardar</span><span className="hidden sm:inline"> Cambios</span><span className="hidden lg:inline"> (Ctrl+S)</span></>}
                    </button>
                )}
            </div>
        </div>

        {/* Layout Principal: Explorador y Editor */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6">

            {/* Panel Izquierdo: Explorador de Archivos */}
            <div className={`min-h-0 w-full ${editingFile ? 'hidden lg:flex lg:w-80 lg:shrink-0' : 'flex flex-1'} flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] transition-all duration-300`}>

                {/* Breadcrumbs Navigation */}
                <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-zinc-800 bg-[#18181b] px-4 py-3 custom-scrollbar">
                    <button
                        onClick={() => { fetchFiles('.'); setEditingFile(null); }}
                        className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        {fileType === 'game' ? 'LinuxServer' : 'lgsm/config'}
                    </button>
                    {breadcrumbs.map((folder, idx) => (
                        <Fragment key={idx}>
                            <span className="text-zinc-600 text-xs">/</span>
                            <button
                                onClick={() => navigateBreadcrumb(idx)}
                                className={`text-sm transition-colors ${idx === breadcrumbs.length - 1 ? 'text-zinc-200 font-bold' : 'text-zinc-400 hover:text-zinc-200 font-medium'}`}
                            >
                                {folder}
                            </button>
                        </Fragment>
                    ))}
                </div>

                {/* File List */}
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 custom-scrollbar">
                    {currentPath !== '.' && (
                        <button
                            type="button"
                            onClick={navigateBack}
                            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
                            aria-label="Volver al directorio anterior"
                        >
                            <div className="p-1.5 bg-zinc-800/50 rounded text-zinc-500 group-hover:text-zinc-300 transition-colors">
                                <ArrowLeft size={16} />
                            </div>
                            <span className="text-zinc-400 text-sm font-medium group-hover:text-zinc-200">Volver atrás</span>
                        </button>
                    )}

                    {fileListError && (
                        <div className="m-2 flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                                <span className="break-words">{fileListError}</span>
                            </div>
                            <button
                                onClick={() => fetchFiles(currentPath)}
                                disabled={fileListLoading}
                                className="inline-flex w-max items-center gap-1.5 rounded-md border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <RefreshCw size={13} className={fileListLoading ? 'animate-spin' : ''} /> Reintentar
                            </button>
                        </div>
                    )}

                    {fileListLoading && fileList.length === 0 && !fileListError && (
                        <div className="p-8 text-center text-zinc-600 italic text-sm">Cargando archivos...</div>
                    )}

                    {fileReadLoading && (
                        <div className="m-2 flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs font-medium text-indigo-200 lg:hidden">
                            <RefreshCw size={14} className="animate-spin text-indigo-300" />
                            Cargando archivo...
                        </div>
                    )}

                    {fileReadError && (
                        <div className="m-2 flex flex-col gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100 lg:hidden">
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
                                <span className="break-words">{fileReadError}</span>
                            </div>
                            {fileReadTarget && (
                                <button
                                    onClick={() => openFile(fileReadTarget)}
                                    disabled={fileReadLoading}
                                    className="inline-flex w-max items-center gap-1.5 rounded-md border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <RefreshCw size={13} className={fileReadLoading ? 'animate-spin' : ''} />
                                    {fileReadLoading ? 'Reintentando...' : 'Reintentar'}
                                </button>
                            )}
                        </div>
                    )}

                    {fileList.length === 0 && !fileListLoading && !fileListError && (
                        <div className="p-8 text-center text-zinc-600 italic text-sm">Directorio vacío</div>
                    )}

                    {fileList.map((file, i) => {
                        const isSelected = editingFile?.name === file.name || fileReadTarget === file.path;
                        const isReading = fileReadLoading && fileReadTarget === file.path;
                        return (
                        <button
                            type="button"
                            key={i}
                            onClick={() => file.isDirectory ? fetchFiles(file.path) : openFile(file.path)}
                            aria-label={`${file.isDirectory ? 'Abrir carpeta' : 'Abrir archivo'} ${file.name}`}
                            aria-selected={isSelected}
                            aria-busy={isReading ? 'true' : undefined}
                            className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 ${
                                isSelected
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 border border-transparent'
                            }`}
                        >
                            <div className={`p-1.5 rounded transition-colors ${
                                file.isDirectory
                                    ? 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20'
                                    : 'bg-zinc-800/50 text-zinc-500 group-hover:text-indigo-400'
                            }`}>
                                {file.isDirectory ? <Folder size={16} /> : <FileText size={16} />}
                            </div>

                            <div className="flex min-w-0 flex-col overflow-hidden">
                                <span className={`text-sm truncate ${isSelected ? 'font-bold' : 'font-medium'}`}>
                                    {file.name}
                                </span>
                                {file.size !== undefined && !file.isDirectory && (
                                    <span className="text-[10px] text-zinc-600">{(file.size / 1024).toFixed(1)} KB</span>
                                )}
                            </div>
                        </button>
                    )})}
                </div>
            </div>

            {/* Panel Derecho: Editor de Código (Solo visible si hay archivo seleccionado) */}
            <AnimatePresence mode="wait">
                {editingFile ? (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                        className="dashboard-card relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] shadow-sm"
                    >
                        {/* Editor Header */}
                        <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-800 bg-[#18181b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <FileText size={16} className="shrink-0 text-cyan-400" />
                                <span className="min-w-0 truncate text-zinc-200 font-mono text-sm font-bold">{editingFile.name}</span>
                                    <span className="shrink-0 bg-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                        {getLanguage(editingFile.name)}
                                    </span>
                                    {editingFile.redacted && (
                                        <span className="shrink-0 bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                            Secretos ocultos
                                        </span>
                                    )}
                            </div>
                            <p className="min-w-0 truncate text-[11px] font-medium text-zinc-500">
                                Ruta: <span className="font-mono text-zinc-400">{editingFileDirectory}</span>
                            </p>
                            </div>
                            <div className="flex items-center justify-between gap-2 sm:justify-end">
                                <button
                                    type="button"
                                    onClick={closeEditor}
                                    className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-700/70 bg-[#09090b] px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-100 sm:hidden"
                                    aria-label="Volver al explorador de archivos"
                                    title="Volver al explorador de archivos"
                                >
                                    <ArrowLeft size={15} />
                                    Volver a archivos
                                </button>
                                {(editingFile.name.endsWith('.cfg') || editingFile.name.endsWith('.ini')) && (
                                    <div className="flex min-w-0 flex-1 items-center bg-[#09090b] border border-zinc-700/50 rounded-lg overflow-hidden sm:flex-none">
                                        <button
                                            type="button"
                                            onClick={() => setEditorMode('visual')}
                                            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors sm:min-h-9 sm:flex-none sm:py-1.5 ${editorMode === 'visual' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                                            aria-label="Editar archivo en modo formulario"
                                        >
                                            <LayoutList size={14} /> <span className="hidden sm:inline">Formulario</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditorMode('code')}
                                            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors sm:min-h-9 sm:flex-none sm:py-1.5 ${editorMode === 'code' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                                            aria-label="Editar archivo en modo codigo"
                                        >
                                            <Code size={14} /> <span className="hidden sm:inline">Código</span>
                                        </button>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={closeEditor}
                                    className="hidden min-h-11 min-w-11 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 sm:flex sm:min-h-9 sm:min-w-9"
                                    title="Cerrar editor"
                                    aria-label="Cerrar editor"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Editor Wrapper */}
                        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#09090b] pt-2">
                            {editingFile.redacted && (
                                <div id="file-redacted-save-warning" className="mx-3 mb-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                    Este archivo contiene secretos redactados. La edición directa queda bloqueada para evitar guardar placeholders; rota secretos en Ajustes globales.
                                </div>
                            )}
                            {editorMode === 'visual' && (editingFile.name.endsWith('.cfg') || editingFile.name.endsWith('.ini')) ? (
	                                <VisualConfigEditor
	                                    content={editingContent}
	                                    onChange={setEditingContent}
                                        onSave={() => {
                                            if (!saveDisabled) saveFileHandlerRef.current();
                                        }}
	                                />
                            ) : (
                                <Editor
                                    height="100%"
                                    language={getLanguage(editingFile.name)}
                                    theme="vs-dark"
                                    value={editingContent}
                                    onChange={(value) => setEditingContent(value)}
                                    onMount={handleEditorDidMount}
                                    options={{
                                        minimap: { enabled: true, scale: 0.75 },
                                        fontSize: 13,
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        wordWrap: 'on',
                                        padding: { top: 10, bottom: 10 },
                                        scrollBeyondLastLine: false,
                                        smoothScrolling: true,
                                        cursorBlinking: 'smooth',
                                        formatOnPaste: true,
                                        scrollbar: {
                                            verticalScrollbarSize: 10,
                                            horizontalScrollbarSize: 10
                                        }
                                    }}
                                    loading={<div className="flex h-full items-center justify-center text-zinc-500 text-sm">Cargando Monaco Editor...</div>}
                                />
                            )}
                            <div className="border-t border-zinc-800/70 bg-[#09090b]/95 p-3 md:hidden">
                                <button
                                    onClick={saveFile}
                                    disabled={saveDisabled}
                                    title={editingFile?.redacted ? 'Este archivo contiene secretos redactados. Usa la rotación segura de secretos.' : 'Guardar cambios'}
                                    aria-describedby={editingFile?.redacted ? 'file-redacted-save-warning' : undefined}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-[#4f7aff] disabled:opacity-50"
                                >
                                    <Save size={16} /> {savingFile ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ) : fileReadLoading ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hidden min-h-0 flex-1 items-center justify-center rounded-lg border border-zinc-800 bg-[#18181b] lg:flex"
                    >
                        <div className="flex flex-col items-center gap-3 text-zinc-500">
                            <RefreshCw size={34} className="animate-spin text-indigo-400" />
                            <p className="text-sm font-medium">Cargando archivo...</p>
                        </div>
                    </motion.div>
                ) : fileReadError ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hidden min-h-0 flex-1 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/5 lg:flex"
                    >
                        <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center text-amber-100">
                            <AlertTriangle size={36} className="text-amber-300" />
                            <p className="text-sm font-semibold">No se pudo abrir el archivo</p>
                            <p className="break-words text-xs text-amber-200/80">{fileReadError}</p>
                            {fileReadTarget && (
                                <button
                                    onClick={() => openFile(fileReadTarget)}
                                    disabled={fileReadLoading}
                                    className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <RefreshCw size={13} className={fileReadLoading ? 'animate-spin' : ''} />
                                    {fileReadLoading ? 'Reintentando...' : 'Reintentar'}
                                </button>
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hidden min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-[#18181b] lg:flex"
                    >
                        <div className="flex flex-col items-center gap-4 opacity-50">
                            <TerminalSquare size={48} className="text-zinc-600" />
                            <p className="text-zinc-500 font-medium">Selecciona un archivo del explorador para empezar a editar</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    </motion.div>
  );
}
