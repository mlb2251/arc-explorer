
// Task navigation state.
var TASK_LIST = [];
var CURRENT_TASK_INDEX = 0;
var CURRENT_DATASET = '';
var CURRENT_CATEGORY = '';

// Function index state.
var FUNCTION_INDEX = null;       // {dslFunctions, taskFunctions, functionTasks}
var ACTIVE_FUNCTION_FILTER = null;
var ORIGINAL_TASK_LIST = null;
var CURRENT_SOLVER_CODE = null;  // raw text of the last loaded solver

// Internal state.
var CURRENT_INPUT_GRID = new Grid(3, 3);
var CURRENT_OUTPUT_GRID = new Grid(3, 3);
var TEST_PAIRS = new Array();
var CURRENT_TEST_PAIR_INDEX = 0;
var COPY_PASTE_DATA = new Array();

// Cosmetic.
var EDITION_GRID_HEIGHT = 300;
var EDITION_GRID_WIDTH = 300;
var MAX_CELL_SIZE = 100;


function resetTask() {
    CURRENT_INPUT_GRID = new Grid(3, 3);
    TEST_PAIRS = new Array();
    CURRENT_TEST_PAIR_INDEX = 0;
    $('#task_preview').html('');
    resetOutputGrid();
}

function refreshEditionGrid(jqGrid, dataGrid) {
    fillJqGridWithData(jqGrid, dataGrid);
    setUpEditionGridListeners(jqGrid);
    fitCellsToContainer(jqGrid, dataGrid.height, dataGrid.width, EDITION_GRID_HEIGHT, EDITION_GRID_HEIGHT);
    initializeSelectable();
}

function syncFromEditionGridToDataGrid() {
    copyJqGridToDataGrid($('#output_grid .edition_grid'), CURRENT_OUTPUT_GRID);
}

function syncFromDataGridToEditionGrid() {
    refreshEditionGrid($('#output_grid .edition_grid'), CURRENT_OUTPUT_GRID);
}

function getSelectedSymbol() {
    selected = $('#symbol_picker .selected-symbol-preview')[0];
    return $(selected).attr('symbol');
}

function setUpEditionGridListeners(jqGrid) {
    jqGrid.find('.cell').click(function(event) {
        cell = $(event.target);
        symbol = getSelectedSymbol();

        mode = $('input[name=tool_switching]:checked').val();
        if (mode == 'floodfill') {
            // If floodfill: fill all connected cells.
            syncFromEditionGridToDataGrid();
            grid = CURRENT_OUTPUT_GRID.grid;
            floodfillFromLocation(grid, cell.attr('x'), cell.attr('y'), symbol);
            syncFromDataGridToEditionGrid();
        }
        else if (mode == 'edit') {
            // Else: fill just this cell.
            setCellSymbol(cell, symbol);
        }
    });
}

function resizeOutputGrid() {
    size = $('#output_grid_size').val();
    size = parseSizeTuple(size);
    height = size[0];
    width = size[1];

    jqGrid = $('#output_grid .edition_grid');
    syncFromEditionGridToDataGrid();
    dataGrid = JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID.grid));
    CURRENT_OUTPUT_GRID = new Grid(height, width, dataGrid);
    refreshEditionGrid(jqGrid, CURRENT_OUTPUT_GRID);
}

function resetOutputGrid() {
    syncFromEditionGridToDataGrid();
    CURRENT_OUTPUT_GRID = new Grid(3, 3);
    syncFromDataGridToEditionGrid();
    resizeOutputGrid();
}

function copyFromInput() {
    syncFromEditionGridToDataGrid();
    CURRENT_OUTPUT_GRID = convertSerializedGridToGridObject(CURRENT_INPUT_GRID.grid);
    syncFromDataGridToEditionGrid();
    $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
}

function fillPairPreview(pairId, inputGrid, outputGrid) {
    var pairSlot = $('#pair_preview_' + pairId);
    if (!pairSlot.length) {
        pairSlot = $('<div id="pair_preview_' + pairId + '" class="pair_preview" index="' + pairId + '"></div>');
        pairSlot.appendTo('#task_preview');
    }
    var jqInputGrid = pairSlot.find('.input_preview');
    if (!jqInputGrid.length) {
        jqInputGrid = $('<div class="input_preview"></div>');
        jqInputGrid.appendTo(pairSlot);
    }
    var jqOutputGrid = pairSlot.find('.output_preview');
    if (!jqOutputGrid.length) {
        jqOutputGrid = $('<div class="output_preview"></div>');
        jqOutputGrid.appendTo(pairSlot);
    }

    fillJqGridWithData(jqInputGrid, inputGrid);
    fitCellsToContainer(jqInputGrid, inputGrid.height, inputGrid.width, 200, 200);
    fillJqGridWithData(jqOutputGrid, outputGrid);
    fitCellsToContainer(jqOutputGrid, outputGrid.height, outputGrid.width, 200, 200);
}

function loadJSONTask(train, test) {
    resetTask();
    $('#error_display').hide();
    $('#info_display').hide();

    for (var i = 0; i < train.length; i++) {
        pair = train[i];
        values = pair['input'];
        input_grid = convertSerializedGridToGridObject(values)
        values = pair['output'];
        output_grid = convertSerializedGridToGridObject(values)
        fillPairPreview(i, input_grid, output_grid);
    }
    for (var i=0; i < test.length; i++) {
        pair = test[i];
        TEST_PAIRS.push(pair);
    }
    values = TEST_PAIRS[0]['input'];
    CURRENT_INPUT_GRID = convertSerializedGridToGridObject(values)
    fillTestInput(CURRENT_INPUT_GRID);
    CURRENT_TEST_PAIR_INDEX = 0;
    $('#current_test_input_id_display').html('1');
    $('#total_test_input_count_display').html(test.length);
}

function display_task_name(task_name, task_index, number_of_tasks) {
    var path = CURRENT_DATASET + '/' + CURRENT_CATEGORY + '/' + task_name;
    $('#task_name').val(path);
    $('#task_index_input').val(task_index);
    var params = new URLSearchParams(window.location.search);
    params.set('task', path);
    history.replaceState(null, '', '?' + params.toString().replace(/%2F/g, '/'));
}

// --- Generic hierarchy navigation ---

function getTaskPath(filename) {
    return '/data/' + CURRENT_DATASET + '/' + CURRENT_CATEGORY + '/' + filename;
}

function loadSolverCode(filename) {
    var solverDiv = $('#solver_display');
    if (CURRENT_DATASET !== 'arc' || CURRENT_CATEGORY !== 'training') {
        solverDiv.hide();
        CURRENT_SOLVER_CODE = null;
        return;
    }
    var taskId = filename.replace('.json', '');
    $.ajax({
        url: '/api/solver?task=' + encodeURIComponent(taskId),
        dataType: 'text',
        success: function(code) {
            CURRENT_SOLVER_CODE = code;
            $('#solver_code').html(buildSolverCodeHtml(code));
            solverDiv.show();
        },
        error: function() {
            CURRENT_SOLVER_CODE = null;
            solverDiv.hide();
        }
    });
}

function loadTaskByIndex(index) {
    var filename = TASK_LIST[index];
    $.getJSON(getTaskPath(filename), function(json) {
        try {
            var train = json['train'];
            var test = json['test'];
        } catch (e) {
            errorMsg('Bad file format');
            return;
        }
        loadJSONTask(train, test);
        display_task_name(filename, index + 1, TASK_LIST.length);
        loadSolverCode(filename);
    }).error(function() {
        errorMsg('Error loading task: ' + filename);
    });
}

// initialFilename: if provided, jump to that file instead of index 0.
function loadTaskList(initialFilename) {
    var apiUrl = '/api/tasks?dataset=' + encodeURIComponent(CURRENT_DATASET) +
                 '&category=' + encodeURIComponent(CURRENT_CATEGORY);
    $.getJSON(apiUrl, function(files) {
        TASK_LIST = files;
        if (TASK_LIST.length === 0) {
            errorMsg('No tasks found in ' + CURRENT_DATASET + '/' + CURRENT_CATEGORY);
            return;
        }
        if (initialFilename) {
            var idx = TASK_LIST.indexOf(initialFilename);
            CURRENT_TASK_INDEX = idx !== -1 ? idx : 0;
        } else {
            CURRENT_TASK_INDEX = 0;
        }
        loadTaskByIndex(CURRENT_TASK_INDEX);
    }).error(function() {
        errorMsg('Could not load task list from server.');
    });
}

// initialCategory/initialFilename: if provided, select that category and file instead of defaults.
function loadCategories(initialCategory, initialFilename) {
    $.getJSON('/api/categories?dataset=' + encodeURIComponent(CURRENT_DATASET), function(categories) {
        var sel = $('#category_select');
        sel.empty();
        categories.forEach(function(cat) {
            sel.append($('<option>').val(cat).text(cat));
        });
        CURRENT_CATEGORY = (initialCategory && categories.indexOf(initialCategory) !== -1)
            ? initialCategory
            : (categories[0] || '');
        $('#category_select').val(CURRENT_CATEGORY);
        loadTaskList(initialFilename);
        loadFunctionIndex();
    }).error(function() {
        errorMsg('Could not load categories for dataset: ' + CURRENT_DATASET);
    });
}

function loadDatasets() {
    var initTask = new URLSearchParams(window.location.search).get('task');
    var initParts = initTask ? initTask.split('/') : null;

    $.getJSON('/api/datasets', function(datasets) {
        var sel = $('#dataset_select');
        sel.empty();
        datasets.forEach(function(ds) {
            sel.append($('<option>').val(ds).text(ds));
        });
        var initDataset = (initParts && datasets.indexOf(initParts[0]) !== -1) ? initParts[0] : datasets[0];
        CURRENT_DATASET = initDataset || '';
        $('#dataset_select').val(CURRENT_DATASET);
        loadCategories(initParts ? initParts[1] : null, initParts ? initParts[2] : null);
    }).error(function() {
        errorMsg('Could not load datasets from server. Is the server running?');
    });
}

function onDatasetChange() {
    CURRENT_DATASET = $('#dataset_select').val();
    resetFunctionFilterState();
    loadCategories();
}

function onCategoryChange() {
    CURRENT_CATEGORY = $('#category_select').val();
    resetFunctionFilterState();
    loadTaskList();
    loadFunctionIndex();
}

function prevTask() {
    if (CURRENT_TASK_INDEX > 0) {
        CURRENT_TASK_INDEX -= 1;
        loadTaskByIndex(CURRENT_TASK_INDEX);
    }
}

function nextTask() {
    if (CURRENT_TASK_INDEX < TASK_LIST.length - 1) {
        CURRENT_TASK_INDEX += 1;
        loadTaskByIndex(CURRENT_TASK_INDEX);
    }
}

function nextTestInput() {
    if (TEST_PAIRS.length <= CURRENT_TEST_PAIR_INDEX + 1) {
        errorMsg('No next test input. Pick another file?')
        return
    }
    CURRENT_TEST_PAIR_INDEX += 1;
    values = TEST_PAIRS[CURRENT_TEST_PAIR_INDEX]['input'];
    CURRENT_INPUT_GRID = convertSerializedGridToGridObject(values)
    fillTestInput(CURRENT_INPUT_GRID);
    $('#current_test_input_id_display').html(CURRENT_TEST_PAIR_INDEX + 1);
    $('#total_test_input_count_display').html(TEST_PAIRS.length);
}

function submitSolution() {
    syncFromEditionGridToDataGrid();
    reference_output = TEST_PAIRS[CURRENT_TEST_PAIR_INDEX]['output'];
    submitted_output = CURRENT_OUTPUT_GRID.grid;
    if (reference_output.length != submitted_output.length) {
        errorMsg('Wrong solution.');
        return
    }
    for (var i = 0; i < reference_output.length; i++){
        ref_row = reference_output[i];
        for (var j = 0; j < ref_row.length; j++){
            if (ref_row[j] != submitted_output[i][j]) {
                errorMsg('Wrong solution.');
                return
            }
        }

    }
    infoMsg('Correct solution!');
}

function fillTestInput(inputGrid) {
    jqInputGrid = $('#evaluation_input');
    fillJqGridWithData(jqInputGrid, inputGrid);
    fitCellsToContainer(jqInputGrid, inputGrid.height, inputGrid.width, 270, 270);
}

function copyToOutput() {
    syncFromEditionGridToDataGrid();
    CURRENT_OUTPUT_GRID = convertSerializedGridToGridObject(CURRENT_INPUT_GRID.grid);
    syncFromDataGridToEditionGrid();
    $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
}

function initializeSelectable() {
    try {
        $('.selectable_grid').selectable('destroy');
    }
    catch (e) {
    }
    toolMode = $('input[name=tool_switching]:checked').val();
    if (toolMode == 'select') {
        infoMsg('Select some cells and click on a color to fill in, or press C to copy');
        $('.selectable_grid').selectable(
            {
                autoRefresh: false,
                filter: '> .row > .cell',
                start: function(event, ui) {
                    $('.ui-selected').each(function(i, e) {
                        $(e).removeClass('ui-selected');
                    });
                }
            }
        );
    }
}

// ── Function index ────────────────────────────────────────────────────────────

function resetFunctionFilterState() {
    ACTIVE_FUNCTION_FILTER = null;
    ORIGINAL_TASK_LIST = null;
    $('#function_filter_bar').hide();
    $('.fn-body').hide();
    $('.fn-item').removeClass('fn-active');
}

function loadFunctionIndex() {
    var pane = $('#function_index_view');
    if (CURRENT_DATASET !== 'arc' || CURRENT_CATEGORY !== 'training') {
        pane.hide();
        $('body').removeClass('has-function-pane');
        return;
    }
    $('body').addClass('has-function-pane');
    pane.show();
    if (FUNCTION_INDEX !== null) {
        renderFunctionPane();
        return;
    }
    $.getJSON('/api/function-index', function(data) {
        // Build reverse map: function name -> [taskId, ...]
        var functionTasks = {};
        for (var taskId in data.taskFunctions) {
            data.taskFunctions[taskId].forEach(function(fn) {
                if (!functionTasks[fn]) functionTasks[fn] = [];
                functionTasks[fn].push(taskId);
            });
        }
        data.functionTasks = functionTasks;
        FUNCTION_INDEX = data;
        renderFunctionPane();
        // Re-render current solver code now that we have hover data
        if (CURRENT_SOLVER_CODE) {
            $('#solver_code').html(buildSolverCodeHtml(CURRENT_SOLVER_CODE));
        }
    }).error(function() {
        pane.hide();
        $('body').removeClass('has-function-pane');
    });
}

function renderFunctionPane() {
    if (!FUNCTION_INDEX) return;
    var functionTasks = FUNCTION_INDEX.functionTasks;

    // Sort functions by task count descending
    var sorted = Object.keys(functionTasks).sort(function(a, b) {
        return functionTasks[b].length - functionTasks[a].length;
    });

    var html = '';
    for (var i = 0; i < sorted.length; i++) {
        var name = sorted[i];
        var count = functionTasks[name].length;
        var body = FUNCTION_INDEX.dslFunctions[name] || '';
        var escapedBody = body
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        var isActive = (ACTIVE_FUNCTION_FILTER === name) ? ' fn-active' : '';
        html += '<div class="fn-item' + isActive + '" data-fn="' + name + '">';
        html += '<div class="fn-header">';
        html += '<span class="fn-name">' + name + '</span>';
        html += '<span class="fn-count">' + count + ' task' + (count === 1 ? '' : 's') + '</span>';
        html += '</div>';
        html += '<pre class="fn-body">' + escapedBody + '</pre>';
        html += '</div>';
    }
    $('#function_list').html(html);

    // Restore expanded state if a filter is active
    if (ACTIVE_FUNCTION_FILTER) {
        var activeItem = $('.fn-item[data-fn="' + ACTIVE_FUNCTION_FILTER + '"]');
        activeItem.find('.fn-body').show();
        $('#function_filter_bar').css('display', 'flex');
        $('#active_fn_name').text(ACTIVE_FUNCTION_FILTER);
    }
}

function selectFunction(name) {
    if (!FUNCTION_INDEX) return;

    var isCurrentlyActive = (ACTIVE_FUNCTION_FILTER === name);

    // Collapse all items
    $('.fn-body').hide();
    $('.fn-item').removeClass('fn-active');

    if (isCurrentlyActive) {
        clearFunctionFilter();
        return;
    }

    // Expand selected item
    var item = $('.fn-item[data-fn="' + name + '"]');
    item.addClass('fn-active');
    item.find('.fn-body').show();

    // Scroll into view within #function_list
    var list = document.getElementById('function_list');
    var itemEl = item[0];
    if (list && itemEl) {
        var itemTop = itemEl.offsetTop - list.offsetTop;
        var itemBottom = itemTop + itemEl.offsetHeight;
        var scrollTop = list.scrollTop;
        var listH = list.clientHeight;
        if (itemTop < scrollTop) {
            list.scrollTop = itemTop - 8;
        } else if (itemBottom > scrollTop + listH) {
            list.scrollTop = itemBottom - listH + 8;
        }
    }

    // Filter task list
    ACTIVE_FUNCTION_FILTER = name;
    var taskIds = FUNCTION_INDEX.functionTasks[name] || [];
    var taskIdSet = {};
    taskIds.forEach(function(id) { taskIdSet[id] = true; });

    if (!ORIGINAL_TASK_LIST) {
        ORIGINAL_TASK_LIST = TASK_LIST.slice();
    }
    TASK_LIST = ORIGINAL_TASK_LIST.filter(function(filename) {
        return taskIdSet[filename.replace('.json', '')];
    });

    $('#function_filter_bar').css('display', 'flex');
    $('#active_fn_name').text(name + ' (' + TASK_LIST.length + ' task' + (TASK_LIST.length === 1 ? '' : 's') + ')');

    CURRENT_TASK_INDEX = 0;
    if (TASK_LIST.length > 0) {
        loadTaskByIndex(0);
    } else {
        errorMsg('No tasks found for function: ' + name);
    }
}

function clearFunctionFilter() {
    if (ORIGINAL_TASK_LIST) {
        TASK_LIST = ORIGINAL_TASK_LIST;
        ORIGINAL_TASK_LIST = null;
    }
    ACTIVE_FUNCTION_FILTER = null;
    $('#function_filter_bar').hide();
    $('.fn-body').hide();
    $('.fn-item').removeClass('fn-active');
    CURRENT_TASK_INDEX = 0;
    if (TASK_LIST.length > 0) {
        loadTaskByIndex(0);
    }
}

function buildSolverCodeHtml(code) {
    // HTML-escape first
    var escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    if (!FUNCTION_INDEX || !FUNCTION_INDEX.dslFunctions) return escaped;

    // Wrap DSL function calls with interactive spans (longest names first)
    var fnNames = Object.keys(FUNCTION_INDEX.dslFunctions).sort(function(a, b) {
        return b.length - a.length;
    });
    fnNames.forEach(function(name) {
        var re = new RegExp('\\b' + name + '(?=\\s*\\()', 'g');
        escaped = escaped.replace(re,
            '<span class="dsl-fn-ref" data-fn="' + name + '">' + name + '</span>');
    });
    return escaped;
}

function positionTooltip(e) {
    var $t = $('#dsl-tooltip');
    var x = e.clientX + 14;
    var y = e.clientY + 14;
    var w = $t.outerWidth(true) || 420;
    var h = $t.outerHeight(true) || 150;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 8;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 8;
    $t.css({ left: x + 'px', top: y + 'px' });
}

// Initial event binding.

$(document).ready(function () {
    $('#symbol_picker').find('.symbol_preview').click(function(event) {
        symbol_preview = $(event.target);
        $('#symbol_picker').find('.symbol_preview').each(function(i, preview) {
            $(preview).removeClass('selected-symbol-preview');
        })
        symbol_preview.addClass('selected-symbol-preview');

        toolMode = $('input[name=tool_switching]:checked').val();
        if (toolMode == 'select') {
            $('.edition_grid').find('.ui-selected').each(function(i, cell) {
                symbol = getSelectedSymbol();
                setCellSymbol($(cell), symbol);
            });
        }
    });

    $('.edition_grid').each(function(i, jqGrid) {
        setUpEditionGridListeners($(jqGrid));
    });

    $('input[type=radio][name=tool_switching]').change(function() {
        initializeSelectable();
    });

    $('input[type=text][name=size]').on('keydown', function(event) {
        if (event.keyCode == 13) {
            resizeOutputGrid();
        }
    });

    $('#task_name').on('keydown', function(event) {
        if (event.keyCode != 13) return;
        var parts = $(this).val().trim().split('/');
        if (parts.length !== 3) {
            errorMsg('Path must be dataset/category/filename.json');
            display_task_name(TASK_LIST[CURRENT_TASK_INDEX], CURRENT_TASK_INDEX + 1, TASK_LIST.length);
            return;
        }
        var dataset = parts[0], category = parts[1], filename = parts[2];
        if (dataset === CURRENT_DATASET && category === CURRENT_CATEGORY) {
            // Same list — just jump to the file.
            var idx = TASK_LIST.indexOf(filename);
            if (idx !== -1) {
                CURRENT_TASK_INDEX = idx;
                loadTaskByIndex(CURRENT_TASK_INDEX);
            } else {
                errorMsg('Task not found: ' + filename);
                display_task_name(TASK_LIST[CURRENT_TASK_INDEX], CURRENT_TASK_INDEX + 1, TASK_LIST.length);
            }
        } else if (dataset === CURRENT_DATASET) {
            // Same dataset, different category — reload task list only.
            CURRENT_CATEGORY = category;
            $('#category_select').val(category);
            loadTaskList(filename);
        } else {
            // Different dataset — reload categories and task list.
            CURRENT_DATASET = dataset;
            $('#dataset_select').val(dataset);
            loadCategories(category, filename);
        }
    });

    $('#task_index_input').on('keydown', function(event) {
        if (event.keyCode == 13) {
            var n = parseInt($(this).val());
            if (!isNaN(n) && n >= 1 && n <= TASK_LIST.length) {
                CURRENT_TASK_INDEX = n - 1;
                loadTaskByIndex(CURRENT_TASK_INDEX);
            } else {
                errorMsg('Task number must be between 1 and ' + TASK_LIST.length);
                $('#task_index_input').val(CURRENT_TASK_INDEX + 1);
            }
        }
    });

    // Fetch datasets from server, cascade into categories and first task.
    loadDatasets();

    // DSL function index: click to select, hover for tooltip
    $(document).on('click', '.fn-header', function() {
        var name = $(this).closest('.fn-item').data('fn');
        selectFunction(name);
    });

    $(document).on('mouseenter', '.dsl-fn-ref', function(e) {
        var fnName = $(this).data('fn');
        if (!FUNCTION_INDEX || !FUNCTION_INDEX.dslFunctions[fnName]) return;
        $('#dsl-tooltip-body').text(FUNCTION_INDEX.dslFunctions[fnName]);
        $('#dsl-tooltip').show();
        positionTooltip(e);
    });

    $(document).on('mouseleave', '.dsl-fn-ref', function() {
        $('#dsl-tooltip').hide();
    });

    $(document).on('mousemove', '.dsl-fn-ref', function(e) {
        positionTooltip(e);
    });

    $('body').keydown(function(event) {
        // Don't hijack keys when typing in an input field.
        if ($(event.target).is('input, select, textarea')) return;

        // Prev/next task navigation.
        if (event.which == 37) { prevTask(); return; }  // left arrow
        if (event.which == 39) { nextTask(); return; }  // right arrow

        // Copy and paste functionality.
        if (event.which == 67) {
            // Press C
            selected = $('.ui-selected');
            if (selected.length == 0) {
                return;
            }

            COPY_PASTE_DATA = [];
            for (var i = 0; i < selected.length; i ++) {
                x = parseInt($(selected[i]).attr('x'));
                y = parseInt($(selected[i]).attr('y'));
                symbol = parseInt($(selected[i]).attr('symbol'));
                COPY_PASTE_DATA.push([x, y, symbol]);
            }
            infoMsg('Cells copied! Select a target cell and press V to paste at location.');

        }
        if (event.which == 86) {
            // Press V
            if (COPY_PASTE_DATA.length == 0) {
                errorMsg('No data to paste.');
                return;
            }
            selected = $('.edition_grid').find('.ui-selected');
            if (selected.length == 0) {
                errorMsg('Select a target cell on the output grid.');
                return;
            }

            jqGrid = $(selected.parent().parent()[0]);

            if (selected.length == 1) {
                targetx = parseInt(selected.attr('x'));
                targety = parseInt(selected.attr('y'));

                xs = new Array();
                ys = new Array();
                symbols = new Array();

                for (var i = 0; i < COPY_PASTE_DATA.length; i ++) {
                    xs.push(COPY_PASTE_DATA[i][0]);
                    ys.push(COPY_PASTE_DATA[i][1]);
                    symbols.push(COPY_PASTE_DATA[i][2]);
                }

                minx = Math.min(...xs);
                miny = Math.min(...ys);
                for (var i = 0; i < xs.length; i ++) {
                    x = xs[i];
                    y = ys[i];
                    symbol = symbols[i];
                    newx = x - minx + targetx;
                    newy = y - miny + targety;
                    res = jqGrid.find('[x="' + newx + '"][y="' + newy + '"] ');
                    if (res.length == 1) {
                        cell = $(res[0]);
                        setCellSymbol(cell, symbol);
                    }
                }
            } else {
                errorMsg('Can only paste at a specific location; only select *one* cell as paste destination.');
            }
        }
    });
});
