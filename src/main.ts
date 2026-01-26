// Day Planner Patch Plugin
// Patches Day Planner to treat [>] (scheduled/forwarded) and [-] (cancelled) tasks as completed
// so they are hidden when "Show completed tasks" is disabled.

const obsidian = require('obsidian');

module.exports = class DayPlannerPatchPlugin extends obsidian.Plugin {
  async onload() {
    console.log('Day Planner Patch: Loading...');

    // Wait for Day Planner to load, then apply patch
    this.app.workspace.onLayoutReady(() => {
      this.applyPatch();
    });
  }

  applyPatch() {
    // Day Planner uses Dataview's STask objects which have:
    // - status: the character inside [ ]
    // - completed: boolean
    // - checked: boolean
    //
    // The filtering likely checks `completed` or `checked` properties.
    // We need to intercept task processing to mark [>] as completed.

    // Strategy: Monkey-patch the Dataview plugin's page() method to
    // transform STask objects, marking those with status=">" as completed.

    const dataviewPlugin = this.app.plugins.plugins['dataview'];
    if (!dataviewPlugin) {
      console.log('Day Planner Patch: Dataview not found, retrying in 1s...');
      setTimeout(() => this.applyPatch(), 1000);
      return;
    }

    const dataviewApi = dataviewPlugin.api;
    if (!dataviewApi) {
      console.log('Day Planner Patch: Dataview API not ready, retrying in 1s...');
      setTimeout(() => this.applyPatch(), 1000);
      return;
    }

    // Store original functions
    const originalPage = dataviewApi.page.bind(dataviewApi);
    const originalPages = dataviewApi.pages.bind(dataviewApi);

    // Helper to create a tasks proxy that transforms tasks on access
    function createTasksProxy(originalTasks) {
      return new Proxy(originalTasks, {
        get(target, prop) {
          if (prop === 'array') {
            return () => {
              const arr = target.array();
              return arr.map(task => transformTask(task));
            };
          }
          if (prop === 'values') {
            return () => {
              const vals = target.values();
              return Array.from(vals).map(task => transformTask(task));
            };
          }
          if (prop === 'where') {
            return (predicate) => {
              const filtered = target.where(predicate);
              return createTasksProxy(filtered);
            };
          }
          if (prop === 'filter') {
            return (predicate) => {
              const filtered = target.filter(predicate);
              return createTasksProxy(filtered);
            };
          }
          if (prop === 'map') {
            return (fn) => {
              const arr = target.array ? target.array() : Array.from(target);
              return arr.map(task => fn(transformTask(task)));
            };
          }
          if (prop === 'forEach') {
            return (fn) => {
              const arr = target.array ? target.array() : Array.from(target);
              arr.forEach(task => fn(transformTask(task)));
            };
          }
          // For iteration
          if (prop === Symbol.iterator) {
            return function* () {
              for (const task of target) {
                yield transformTask(task);
              }
            };
          }
          // Handle length property
          if (prop === 'length') {
            return target.length;
          }
          // Handle array index access
          if (typeof prop === 'string' && !isNaN(prop)) {
            return transformTask(target[prop]);
          }
          return target[prop];
        }
      });
    }

    // Patch the page function to transform tasks
    dataviewApi.page = (path, originFile) => {
      const result = originalPage(path, originFile);

      if (result && result.file && result.file.tasks) {
        result.file.tasks = createTasksProxy(result.file.tasks);
      }

      return result;
    };

    // Patch the pages function to transform tasks in all returned pages
    dataviewApi.pages = (query, originFile) => {
      const result = originalPages(query, originFile);

      if (result) {
        // Create a proxy for the pages result that transforms tasks in each page
        return new Proxy(result, {
          get(target, prop) {
            if (prop === 'file') {
              const fileProxy = new Proxy(target.file, {
                get(fileTarget, fileProp) {
                  if (fileProp === 'tasks') {
                    return createTasksProxy(fileTarget.tasks);
                  }
                  return fileTarget[fileProp];
                }
              });
              return fileProxy;
            }
            if (prop === 'array') {
              return () => {
                const arr = target.array();
                return arr.map(page => {
                  if (page && page.file && page.file.tasks) {
                    return {
                      ...page,
                      file: {
                        ...page.file,
                        tasks: createTasksProxy(page.file.tasks)
                      }
                    };
                  }
                  return page;
                });
              };
            }
            if (prop === Symbol.iterator) {
              return function* () {
                for (const page of target) {
                  if (page && page.file && page.file.tasks) {
                    yield {
                      ...page,
                      file: {
                        ...page.file,
                        tasks: createTasksProxy(page.file.tasks)
                      }
                    };
                  } else {
                    yield page;
                  }
                }
              };
            }
            return target[prop];
          }
        });
      }

      return result;
    };

    console.log('Day Planner Patch: Successfully patched Dataview API (page + pages)');
    new obsidian.Notice('Day Planner Patch: Active');
  }

  onunload() {
    // Note: We can't easily restore the original function since we don't
    // keep a reference. The patch will remain until Obsidian restarts.
    console.log('Day Planner Patch: Unloaded (restart Obsidian to fully remove patch)');
  }
};

// Transform a task: if status is ">" or "-", mark it as completed
function transformTask(task) {
  if (!task) return task;

  // Check if this is a scheduled-away task [>] or cancelled task [-]
  if (task.status === '>' || task.status === '-') {
    // Return a new object with completed/checked set to true
    // This doesn't modify the original task, just how Day Planner sees it
    return {
      ...task,
      completed: true,
      checked: true,
      fullyCompleted: true
    };
  }

  return task;
}
