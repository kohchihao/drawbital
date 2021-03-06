// Real-time client drawing
var canvas = document.getElementById('publicSurface');
var ctx = canvas.getContext('2d');

// Saved client drawing but not permanent (able to undo/redo)
var serverCanvas = document.getElementById('serverSurface');
var serverCtx = serverCanvas.getContext('2d');

// Saved and permanent drawings (unable to undo/redo)
var permCanvas = document.getElementById('permanentSurface');
var permCtx = permCanvas.getContext('2d');

// Draw cursors
var cursorLayer = document.getElementById('cursorLayer');
var cursorCtx = cursorLayer.getContext('2d');

// Client viewport
var viewCanvas = document.getElementById('view');
var viewCtx = viewCanvas.getContext('2d');

var CANVAS_WIDTH = 3500;
var CANVAS_HEIGHT = 3500;
var looping = false;
var canvasArray = [canvas, serverCanvas, cursorLayer, permCanvas];
var curColour = "#000000"
var curTool = "brush";
var curSize = 5;
/* global io */
var socket = io();
var PANNING_SPEED = 10;
var scale = 1;
var ZOOM_STEP = 20; // Higher value = smaller steps
var serverData, publicData, permData, cursorData;
var serverDrawn = true, publicDrawn = true, permDrawn = true, cursorDrawn = true;
var timerPanel = document.getElementById('timerPanel');
var rightMousedown = false;
var rMouseX, rMouseY;
var mouseX, mouseY;
var mousemove = false;
// Current topleft x and y coordinates of viewCanvas
var viewX = 0;
var viewY = 0;

for(var i = 0; i < canvasArray.length; i++) {
    canvasArray[i].width = CANVAS_WIDTH;
    canvasArray[i].height = CANVAS_HEIGHT;
}

$(document).ready(function () {
    $('#full').spectrum({
        color: '#000000',
        showInput: true,
        className: 'full-spectrum',
        showInitial: true,
        showPalette: true,
        showSelectionPalette: true,
        maxSelectionSize: 20,
        preferredFormat: 'hex',
        localStorageKey: 'spectrum.drawbital',
        showAlpha: true,
        move: function (colour) {
            curColour = colour.toRgbString();
            socket.emit('colour', { value: colour.toRgbString() });
        },
        palette: [
            ["#000", "#444", "#666", "#999", "#ccc", "#eee", "#f3f3f3", "#fff"],
            ["#f00", "#f90", "#ff0", "#0f0", "#0ff", "#00f", "#90f", "#f0f"],
            ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc"],
            ["#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
            ["#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6fa8dc", "#8e7cc3", "#c27ba0"],
            ["#c00", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3d85c6", "#674ea7", "#a64d79"],
            ["#900", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#0b5394", "#351c75", "#741b47"],
            ["#600", "#783f04", "#7f6000", "#274e13", "#0c343d", "#073763", "#20124d", "#4c1130"]
        ]
    });
    resize();
    viewX = (canvas.width / 2) - (viewCanvas.width / 2);
    viewY = (canvas.height / 2) - (viewCanvas.height / 2);
});

socket.on('drawServerData', function (data) {
    serverData = data;
    serverDrawn = false;
});

socket.on('drawPublicData', function (data) {
    publicData = data;
    publicDrawn = false;
});

socket.on('drawCursorData', function (data) {
    cursorData = data;
    cursorDrawn = false;
})

socket.on('drawPermData', function (data) {
    permData = data;
    permDrawn = false;
})

// Start the requestAnimationFrame loop on successful sign in
socket.on('joinStatus', function (data) {
    if (data.value) {
        if (data.roomMode == "game")
            timerPanel.style.display = "inline";
        else
            timerPanel.style.display = "none";

        if(!looping) {
            repeat();
            looping = true;
        }
    }
})

// Draws non-realtime data to context
function drawToCtx(context, data) {
    var points;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < data.actionList.length; i++) {
        if (!data.actionList[i].deleted) {
            points = data.actionList[i].points;
            if (data.actionList[i].tool === "text") {
                context.font = data.actionList[i].size + "px sans-serif";
                context.fillStyle = data.actionList[i].colour;
                context.fillText(data.actionList[i].text, points[0][0], points[0][1]);
            }
            else {
                context.lineJoin = "round";
                context.lineCap = "round";
                context.strokeStyle = data.actionList[i].colour;
                context.lineWidth = data.actionList[i].size;
                context.beginPath();
                context.moveTo(points[0][0], points[0][1] - 0.01);
                for (var j = 1; j < points.length; j++) {
                    if (points[j][0] > 0)
                        context.lineTo(points[j][0], points[j][1]);
                }
                context.stroke();
            }
        }
    }
}

// Draws realtime data to context
function drawToCtxRealtime(context, data) {
    context.lineJoin = "round";
    context.lineCap = "round";
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (var i in data.publicPathMap) {
        context.strokeStyle = data.clientColours[i];
        context.lineWidth = data.clientSizes[i];
        if (data.publicPathMap[i][0]) {
            context.beginPath();
            context.moveTo(data.publicPathMap[i][0][0], data.publicPathMap[i][0][1]);
            for (var j = 1; j < data.publicPathMap[i].length; j++) {
                context.lineTo(data.publicPathMap[i][j][0], data.publicPathMap[i][j][1]);
            }
            context.stroke();
        }
    }
}

document.getElementById("clearBtn").onclick = function () {
    socket.emit('clear');
};

socket.on('clear', function () {
    serverCtx.clearRect(0, 0, canvas.width, canvas.height);
    permCtx.clearRect(0, 0, canvas.width, canvas.height);
});

document.getElementById("brushBtn").onclick = function () {
    changeTool("brush");
};
document.getElementById("textBtn").onclick = function () {
    changeTool("text");
};
document.getElementById("undoBtn").onclick = function () {
    socket.emit('undo');
};
document.getElementById("redoBtn").onclick = function () {
    socket.emit('redo');
};
document.getElementById("zoomOutBtn").onclick = function () {
    zoom(-0.1);
};
document.getElementById("resetZoomBtn").onclick = function () {
    scale = 1;
};
document.getElementById("zoomInBtn").onclick = function () {
    zoom(0.1);
};

function changeTool(tool) {
    curTool = tool;
    socket.emit('changeTool', { toolName: tool });

    // Clears brush cursor
    if (curTool === "text") {
        cursorCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function zoom(delta) {
    if(scale + delta >= 0.2 && scale + delta <= 3)
        scale += delta;
}

// Get accurate mouse positions
function getMousePos(canvas, evt) {
    var rect = viewCanvas.getBoundingClientRect();
    return {
        x: (evt.clientX - rect.left + (viewX * scale)) / scale,
        y: (evt.clientY - rect.top + (viewY * scale)) / scale
    };
}

viewCanvas.onmousedown = function (e) {
    var pos = getMousePos(viewCanvas, e);
    mouseX = pos.x;
    mouseY = pos.y;
    document.onselectstart = function () { return false; } // Prevent text selection when dragging
    if(e.button == 0) {
        if (curTool == "brush")
            socket.emit('keyPress', { inputId: 'mousedown', x: pos.x, y: pos.y, state: true });
        else if (curTool == "text")
            socket.emit('drawText', { x: pos.x, y: pos.y, text: prompt("Enter text:", "") });
    }
    
    if(e.button == 2) {
        viewCanvas.style.cursor = 'move';
        rMouseX = pos.x;
        rMouseY = pos.y;
        rightMousedown = true;
    }
}

viewCanvas.onmousemove = function (e) {
    mousemove = true;
    var pos = getMousePos(viewCanvas, e);
    mouseX = pos.x;
    mouseY = pos.y;
    socket.emit('keyPress', { inputId: 'mousemove', x: pos.x, y: pos.y, state: true });
    cursorDrawn = false;
};

viewCanvas.oncontextmenu = function() {
    return false;
}

$('#view').mousestop(10, function() {
    mousemove = false;
})

function dragMove(x, y) {
    if(rightMousedown && mousemove) {
        if(viewX - (x - rMouseX) > 0 && (viewX - (x - rMouseX)) < canvas.width - (viewCanvas.width / scale))
            viewX -= x - rMouseX;
        if(viewY - (y - rMouseY) > 0 && (viewY - (y - rMouseY)) < canvas.height - (viewCanvas.height / scale))
            viewY -= y - rMouseY;
    }
}

// Draw other clients cursors
function drawPublicCursors(data) {
    for(var i in data.position) {
        if(socket.id == i)
            continue;
        cursorCtx.fillStyle = data.colour[i];
        cursorCtx.lineWidth = 1;
        cursorCtx.beginPath();
        cursorCtx.arc(data.position[i][0], data.position[i][1], data.size[i] / 2, 0, Math.PI * 2, true);
        cursorCtx.closePath();
    }
    cursorCtx.fill();
    labelCursors(data);
}

// Draw client names under their cursors
function labelCursors(data) {
    cursorCtx.lineWidth = 0.8;
    cursorCtx.font = "15pt Calibri"
    cursorCtx.textAlign='center';
    cursorCtx.fillStyle = 'white';
    cursorCtx.strokeStyle = 'black';
    for(var i in data.position) {
        if(socket.id == i)
            continue;
        cursorCtx.fillText(data.name[i], data.position[i][0], data.position[i][1] + data.size[i] / 2 + 15);
        cursorCtx.strokeText(data.name[i], data.position[i][0], data.position[i][1] + data.size[i] / 2 + 15);
    }
}

// Draw user's cursor
function drawLocalCursor(x, y) {
    cursorCtx.fillStyle = curColour;
    cursorCtx.lineWidth = 1;
    cursorCtx.beginPath();
    cursorCtx.arc(x, y, curSize / 2, 0, Math.PI * 2, true);
    cursorCtx.closePath();
    cursorCtx.fill();
}

// Draw all cursors
function drawCursors() {
    cursorCtx.clearRect(0, 0, canvas.width, canvas.height);
    drawPublicCursors(cursorData);
    if(curTool == "brush")
        drawLocalCursor(mouseX, mouseY);
}

viewCanvas.onmouseup = function (e) {
    document.onselectstart = function () { return true; } // Allow text selection
    if(e.button == 0) {
        socket.emit('keyPress', { inputId: 'mousedown', state: false });
    }
    if(e.button == 2) {
        viewCanvas.style.cursor = 'auto';
        rightMousedown = false;
        rMouseX = undefined;
        rMouseY = undefined;
    }
};

viewCanvas.onmouseleave = () => {
    viewCanvas.style.cursor = 'auto';
    rightMousedown = false;
    rMouseX = undefined;
    rMouseY = undefined;
    socket.emit('keyPress', { inputId: 'mousedown', state: false });
};

document.getElementById("brushSize").onchange = function () {
    curSize = $('#brushSize').val();
    socket.emit('size', { value: curSize });
}

var keyStates = {
    'W': false,
    'A': false,
    'S': false,
    'D': false
}

// Change the size of elements when the browser is resized
window.onresize = function () {
    resize();
};

var chatDiv = document.getElementById('chatDiv');
function resize() {
    viewCanvas.width = window.innerWidth - $('#chatDiv').width() - 40;
    viewCanvas.height = window.innerHeight - 200;
    chatDiv.style.height = viewCanvas.height + "px";
}

// Update loop
function repeat() {
    viewCtx.fillStyle = 'white';
    viewCtx.fillRect(0, 0, viewCanvas.width, viewCanvas.height);
    drawAll();
    dragMove(mouseX, mouseY);
    translateAll();
    drawZoomed();
    requestAnimationFrame(repeat);
}

// Draw on each respective canvas if an update was received for that canvas and it has not yet been drawn
function drawAll() {
    if (!serverDrawn) {
        drawToCtx(serverCtx, serverData);
        serverDrawn = true;
    }
    if (!publicDrawn) {
        drawToCtxRealtime(ctx, publicData);
        publicDrawn = true;
    }
    if (!permDrawn) {
        drawToCtx(permCtx, permData);
        permDrawn = true;
    }
    if (!cursorDrawn) {
        drawCursors();
        cursorDrawn = true;
    }
}

// Draw viewCanvas taking zoom into account
function drawZoomed() {
    viewCtx.save();
    viewCtx.scale(scale, scale);
    viewCtx.drawImage(permCanvas, viewX, viewY, viewCanvas.width / scale, viewCanvas.height / scale, 0, 0,
        viewCanvas.width / scale, viewCanvas.height / scale);
    viewCtx.drawImage(serverCanvas, viewX, viewY, viewCanvas.width / scale, viewCanvas.height / scale, 0, 0,
        viewCanvas.width / scale, viewCanvas.height / scale);
    viewCtx.drawImage(cursorLayer, viewX, viewY, viewCanvas.width / scale, viewCanvas.height / scale, 0, 0,
        viewCanvas.width / scale, viewCanvas.height / scale);
    viewCtx.drawImage(canvas, viewX, viewY, viewCanvas.width / scale, viewCanvas.height / scale, 0, 0,
        viewCanvas.width / scale, viewCanvas.height / scale);
    viewCtx.restore();
}

viewCanvas.onmousewheel = function (event) {
    zoom((event.wheelDelta / 120) / ZOOM_STEP);
}

// Panning logic
function translateAll() {
    if (keyStates['W']) {
        if(viewY > 0)
            viewY -= PANNING_SPEED;
    }
    if (keyStates['D']) {
        if(viewX + viewCanvas.width < canvas.width)
            viewX += PANNING_SPEED;
    }
    if (keyStates['S']) {
        if (viewY + viewCanvas.height < canvas.height)
            viewY += PANNING_SPEED;
    }
    if (keyStates['A']) {
        if (viewX > 0)
            viewX -= PANNING_SPEED;
    }
}

viewCanvas.onkeydown = function (event) {
    if (String.fromCharCode(event.keyCode) == 'W') {
        keyStates['W'] = true;
    }
    if (String.fromCharCode(event.keyCode) == 'A') {
        keyStates['A'] = true;
    }
    if (String.fromCharCode(event.keyCode) == 'S') {
        keyStates['S'] = true;
    }
    if (String.fromCharCode(event.keyCode) == 'D') {
        keyStates['D'] = true;
    }
}

viewCanvas.onkeyup = function (event) {
    if (String.fromCharCode(event.keyCode) == 'W') {
        keyStates['W'] = false;
    }
    if (String.fromCharCode(event.keyCode) == 'A') {
        keyStates['A'] = false;
    }
    if (String.fromCharCode(event.keyCode) == 'S') {
        keyStates['S'] = false;
    }
    if (String.fromCharCode(event.keyCode) == 'D') {
        keyStates['D'] = false;
    }
}

$('#saveForm').submit(() => {
    socket.emit('saveState', {saveName: $('#saveName').val()}, data => {
        if(data.nameExists) {
            showSnackBar('A save with the same name already exists.', 'danger');
        }
        else {
            $('#saveModal').modal('hide');
            $('#saveName').val('');
            showSnackBar('Saved', 'success')
        }
    });
    return false;
})

$('#loadBtn').on('click', () => {
    socket.emit('getSaveList');
})

socket.on('saveList', data => {
    $('#saveList').empty();
    for(var i in data.saves){
        $('#saveList').append(`<a id="load${i}" class="list-group-item list-group-item-action" saveName="${data.saves[i]}" href="#">${data.saves[i]}<button type="button" saveName="${data.saves[i]}" class="close" id="delete${i} ">&times;</button></a>`);
    }
})

$('#saveList').on('dblclick', '.list-group-item', function() {
    socket.emit('loadState', { idx: this.getAttribute("saveName") }, function(data) {
        if(data) 
            showSnackBar('Save loaded', 'success')
        else
            showSnackBar('Load not allowed in Guessketch', 'danger')
    })
    $('#loadModal').modal('hide');
})

$('#saveList').on('click', '.close', function() {
    socket.emit('deleteSave', { idx: this.getAttribute("saveName") })
    $(`#load${this.id.slice(6)}`).remove();
})

$('#downloadBtn').on('click', function() {
    generateCanvasImage();
})

// Saves an image of the current canvas and creates a download link
function generateCanvasImage() {
    var imageCanvas = document.createElement('canvas');
    var imageCtx = imageCanvas.getContext('2d');
    imageCanvas.width = canvas.width;
    imageCanvas.height = canvas.height;
    imageCtx.fillStyle = 'white';
    imageCtx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
    imageCtx.drawImage(permCanvas, 0, 0);
    imageCtx.drawImage(serverCanvas, 0, 0);
    var link = document.getElementById('link');
    link.setAttribute('download', 'canvasImage.png');
    link.setAttribute('href', imageCanvas.toDataURL('image/png').replace('image/png', 'image/octet-stream'));
    link.click();
}