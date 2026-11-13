import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";
import { FiAlertCircle, FiCheckCircle, FiChevronDown, FiChevronUp, FiLoader, FiX } from "react-icons/fi";

export type TaskStatus = "running" | "success" | "error";

export interface ToastTask {
    id: string;
    title: string;
    detail?: string;
    /** 0-100. `null` / `undefined` renders an indeterminate bar. */
    progress?: number | null;
    status: TaskStatus;
}

interface StartTaskOptions {
    title: string;
    detail?: string;
    progress?: number | null;
}

interface FinishTaskOptions {
    status: "success" | "error";
    title?: string;
    detail?: string;
}

interface TaskToastActions {
    startTask: (options: StartTaskOptions) => string;
    updateTask: (id: string, patch: Partial<Pick<ToastTask, "title" | "detail" | "progress">>) => void;
    finishTask: (id: string, options: FinishTaskOptions) => void;
    dismissTask: (id: string) => void;
}

interface TaskToastState {
    tasks: ToastTask[];
    minimized: boolean;
    setMinimized: (value: boolean) => void;
    dismissAll: () => void;
}

const noopActions: TaskToastActions = {
    startTask: () => "",
    updateTask: () => {},
    finishTask: () => {},
    dismissTask: () => {},
};

const ActionsContext = createContext<TaskToastActions>(noopActions);
const StateContext = createContext<TaskToastState>({
    tasks: [],
    minimized: false,
    setMinimized: () => {},
    dismissAll: () => {},
});

/** How long a successful task stays visible before it disappears on its own. */
const SUCCESS_LINGER_MS = 6000;

let taskCounter = 0;

export function TaskToastProvider({ children }: { children: ReactNode }) {
    const [tasks, setTasks] = useState<ToastTask[]>([]);
    const [minimized, setMinimized] = useState(false);
    const timers = useRef<Map<string, number>>(new Map());

    const clearTimer = useCallback((id: string) => {
        const t = timers.current.get(id);
        if (t !== undefined) {
            window.clearTimeout(t);
            timers.current.delete(id);
        }
    }, []);

    const dismissTask = useCallback((id: string) => {
        clearTimer(id);
        setTasks((prev) => prev.filter((t) => t.id !== id));
    }, [clearTimer]);

    const startTask = useCallback((options: StartTaskOptions) => {
        taskCounter += 1;
        const id = `task-${Date.now()}-${taskCounter}`;
        setTasks((prev) => [
            ...prev,
            {
                id,
                title: options.title,
                detail: options.detail,
                progress: options.progress,
                status: "running",
            },
        ]);
        return id;
    }, []);

    const updateTask = useCallback<TaskToastActions["updateTask"]>((id, patch) => {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    }, []);

    const finishTask = useCallback((id: string, options: FinishTaskOptions) => {
        setTasks((prev) =>
            prev.map((t) =>
                t.id === id
                    ? {
                        ...t,
                        status: options.status,
                        title: options.title ?? t.title,
                        detail: options.detail,
                        progress: options.status === "success" ? 100 : t.progress,
                    }
                    : t
            )
        );
        if (options.status === "error") {
            // Make sure failures are never hidden behind a minimized panel.
            setMinimized(false);
        } else {
            clearTimer(id);
            timers.current.set(
                id,
                window.setTimeout(() => {
                    timers.current.delete(id);
                    setTasks((prev) => prev.filter((t) => t.id !== id));
                }, SUCCESS_LINGER_MS)
            );
        }
    }, [clearTimer]);

    const dismissAll = useCallback(() => {
        timers.current.forEach((t) => window.clearTimeout(t));
        timers.current.clear();
        setTasks((prev) => prev.filter((t) => t.status === "running"));
    }, []);

    useEffect(() => {
        const current = timers.current;
        return () => {
            current.forEach((t) => window.clearTimeout(t));
            current.clear();
        };
    }, []);

    const actions = useMemo<TaskToastActions>(
        () => ({ startTask, updateTask, finishTask, dismissTask }),
        [startTask, updateTask, finishTask, dismissTask]
    );

    const state = useMemo<TaskToastState>(
        () => ({ tasks, minimized, setMinimized, dismissAll }),
        [tasks, minimized, dismissAll]
    );

    return (
        <ActionsContext.Provider value={actions}>
            <StateContext.Provider value={state}>
                {children}
                <TaskToastHost />
            </StateContext.Provider>
        </ActionsContext.Provider>
    );
}

/** Stable actions for starting / updating / finishing toast tasks. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTaskToast(): TaskToastActions {
    return useContext(ActionsContext);
}

function clampPercent(value: number) {
    return Math.max(0, Math.min(100, value));
}

function TaskToastHost() {
    const { tasks, minimized, setMinimized, dismissAll } = useContext(StateContext);

    if (tasks.length === 0) return null;

    const running = tasks.filter((t) => t.status === "running");
    const hasRunning = running.length > 0;

    // Aggregate progress for the minimized bar
    const determinate = running.filter((t) => typeof t.progress === "number");
    const allIndeterminate = hasRunning && determinate.length === 0;
    const overall = determinate.length
        ? determinate.reduce((sum, t) => sum + clampPercent(t.progress as number), 0) / determinate.length
        : 0;

    const isSingle = tasks.length === 1;

    return (
        <div className="task-toast" role="status" aria-live="polite">
            {!isSingle && (
                <div className="task-toast-controls">
                    <span className="task-toast-summary">
                        {hasRunning
                            ? `${running.length} task${running.length === 1 ? "" : "s"} in progress`
                            : `${tasks.length} task${tasks.length === 1 ? "" : "s"} completed`}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                        <button
                            type="button"
                            className="task-toast-btn"
                            onClick={() => setMinimized(!minimized)}
                            aria-label={minimized ? "Expand" : "Minimize"}
                            title={minimized ? "Expand" : "Minimize"}
                        >
                            {minimized ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                        </button>
                        {!hasRunning && (
                            <button
                                type="button"
                                className="task-toast-btn"
                                onClick={dismissAll}
                                aria-label="Close"
                                title="Close"
                            >
                                <FiX size={18} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {minimized && !isSingle ? (
                hasRunning && (
                    <div className="task-toast-progress task-toast-progress-mini">
                        <div
                            className={`task-toast-progress-bar ${allIndeterminate ? "indeterminate" : ""}`}
                            style={allIndeterminate ? undefined : { width: `${overall}%` }}
                        />
                    </div>
                )
            ) : (
                <div className="task-toast-body">
                    {tasks.map((task) => (
                        <TaskRow
                            key={task.id}
                            task={task}
                            showClose={isSingle && task.status !== "running"}
                            onClose={dismissAll}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function TaskRow({
    task,
    showClose,
    onClose,
}: {
    task: ToastTask;
    showClose?: boolean;
    onClose?: () => void;
}) {
    const isDeterminate = typeof task.progress === "number";
    const percent = isDeterminate ? clampPercent(task.progress as number) : 0;

    return (
        <div className={`task-toast-row ${task.status}`}>
            <div className="task-toast-row-top">
                {task.status === "running" && <FiLoader size={14} className="spin task-toast-icon running" />}
                {task.status === "success" && <FiCheckCircle size={14} className="task-toast-icon success" />}
                {task.status === "error" && <FiAlertCircle size={14} className="task-toast-icon error" />}
                <span className="task-toast-row-title" title={task.title}>{task.title}</span>
                {task.status === "running" && isDeterminate && (
                    <span className="task-toast-row-percent">{Math.round(percent)}%</span>
                )}
                {showClose && (
                    <button
                        type="button"
                        className="task-toast-btn task-toast-btn-inline"
                        onClick={onClose}
                        aria-label="Close"
                        title="Close"
                    >
                        <FiX size={16} />
                    </button>
                )}
            </div>
            {task.detail && <div className="task-toast-row-detail" title={task.detail}>{task.detail}</div>}
            {task.status === "running" && (
                <div className="task-toast-progress">
                    <div
                        className={`task-toast-progress-bar ${isDeterminate ? "" : "indeterminate"}`}
                        style={isDeterminate ? { width: `${percent}%` } : undefined}
                    />
                </div>
            )}
        </div>
    );
}

