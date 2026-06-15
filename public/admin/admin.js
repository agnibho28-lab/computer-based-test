/* ========================================= */
/* ADMIN PANEL - FULL MANAGEMENT             */
/* ========================================= */

/* ========================================= */
/* PASSWORD PROTECTION                       */
/* ========================================= */

var ADMIN_PASSWORD = "2026";

/* Fetch the password from the server so it stays in sync */
fetch("/api/admin-password").then(function(r) { return r.json(); }).then(function(data) {
    if (data.password) {
        ADMIN_PASSWORD = data.password;
    }
});

function checkPassword() {
    var passInput = document.getElementById("passwordInput");
    var error = document.getElementById("loginError");
    if (passInput.value === ADMIN_PASSWORD) {
        sessionStorage.setItem("adminLoggedIn", "true");
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("adminContainer").style.display = "block";
        error.textContent = "";
        initAdmin();
    } else {
        error.textContent = "❌ Invalid password. Try again.";
        passInput.value = "";
        passInput.focus();
    }
}

let sections = [];
let questions = [];
let mathPreviewOn = false;
let currentQuestionImages = [];
let currentQuestionTables = [];
let nextImageId = 0;
let nextTableId = 0;

var SUBSECTION_TYPE_OPTIONS = [
  {value: "single", label: "Single Correct (SCQ)"},
  {value: "multi", label: "Multiple Correct (MCQ)"},
  {value: "numerical", label: "Numerical / Integer"}
];

function getSubsections(section) {
  if (section.subsections && Array.isArray(section.subsections) && section.subsections.length > 0) {
    return section.subsections;
  }
  var order = section.subsectionOrder || ["single", "multi", "numerical"];
  var defaultLabels = {single: "Single Correct (SCQ)", multi: "Multiple Correct Questions", numerical: "Integer / Numerical"};
  var defaultTypes = {single: "single", multi: "multi", numerical: "numerical"};
  return order.map(function(id) {
    return {id: id, label: defaultLabels[id] || id, type: defaultTypes[id] || id};
  });
}

function getSubsectionTypeLabel(type) {
  var found = SUBSECTION_TYPE_OPTIONS.find(function(o) { return o.value === type; });
  return found ? found.label : type;
}

function generateSubsectionId() {
  return "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
}

/* ========================================= */
/* SECTIONS                                  */
/* ========================================= */

function loadSections() {
    fetch("/api/sections").then(function(r) { return r.json(); }).then(function(data) {
        sections = data;
        renderSections();
        populateSectionDropdowns();
    });
}

function renderSections() {
    var container = document.getElementById("sectionsContainer");
    if (sections.length === 0) {
        container.innerHTML = '<div class="no-data">No sections yet. Create one above!</div>';
        return;
    }
    var html = "";
    sections.forEach(function(s, idx) {
        var qCount = questions.filter(function(q) { return q.sectionId === s.id; }).length;
        var subs = getSubsections(s);
        
        var subHtml = subs.map(function(sub, si) {
            var leftArrow = "";
            var rightArrow = "";
            if (si > 0) {
                leftArrow = '<span class="sub-move" onclick="moveSubsection(' + s.id + ",'" + sub.id + "','up'" + ')" title="Move left">\u25C0</span>';
            }
            if (si < subs.length - 1) {
                rightArrow = '<span class="sub-move" onclick="moveSubsection(' + s.id + ",'" + sub.id + "','down'" + ')" title="Move right">\u25B6</span>';
            }
            var typeOptsHtml = SUBSECTION_TYPE_OPTIONS.map(function(o) {
                var sel = (o.value === sub.type) ? ' selected' : '';
                return '<option value="' + o.value + '"' + sel + '>' + o.label + '</option>';
            }).join('');
            return '<div class="subsection-edit-item">'
                + '<input class="sub-label-input" type="text" value="' + escHtml(sub.label) + '" '
                + 'onchange="updateSubsectionLabel(' + s.id + ',\'' + sub.id + '\',this.value)" '
                + 'placeholder="Display label">'
                + '<select class="sub-type-select" onchange="updateSubsectionType(' + s.id + ',\'' + sub.id + '\',this.value)">'
                + typeOptsHtml + '</select>'
                + '<span class="sub-move-group">' + leftArrow + rightArrow + '</span>'
                + '<button class="btn-danger" onclick="removeSubsection(' + s.id + ',\'' + sub.id + '\')" title="Remove subsection">\u2715</button>'
                + '</div>';
        }).join("");

        var isFirst = (idx === 0);
        var isLast = (idx === sections.length - 1);
        var escName = s.name.replace(/'/g, "\\'");

        html += '<div class="section-card" data-id="' + s.id + '">';
        html += '<span class="drag" title="Drag to reorder">\u28BF</span>';
        html += '<input class="name" value="' + escHtml(s.name) + '" onchange="renameSection(' + s.id + ', this.value)" style="flex:1;font-weight:bold;font-size:15px;border:1px solid transparent;padding:6px 8px;border-radius:6px;background:transparent" onfocus="this.style.borderColor=\'#bbb\';this.style.background=\'white\'" onblur="this.style.borderColor=\'transparent\';this.style.background=\'transparent\'">';
        html += '<span class="q-count">' + qCount + ' question' + (qCount !== 1 ? 's' : '') + '</span>';
        html += '<div class="actions">';
        html += '<button class="btn-edit" onclick="moveSection(' + s.id + ",'up'" + ')" ' + (isFirst ? 'disabled style="opacity:0.4"' : '') + ' title="Move up">\u2191</button>';
        html += '<button class="btn-edit" onclick="moveSection(' + s.id + ",'down'" + ')" ' + (isLast ? 'disabled style="opacity:0.4"' : '') + ' title="Move down">\u2193</button>';
        html += '<button class="btn-danger" onclick="deleteSection(' + s.id + ",'" + escName + "')" + '" title="Delete">\u2715</button>';
        html += '</div></div>';

        html += '<div class="subsection-order-area">';
        html += '<div class="sub-header-row"><span class="sub-label">Subsections:</span>';
        html += '<button class="btn-info btn-sm" onclick="addSubsection(' + s.id + ')">+ Add Subsection</button></div>';
        html += subHtml;
        html += '</div>';
    });
    container.innerHTML = html;
    setupDragReorder();
}

function moveSubsection(sectionId, subId, dir) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    var idx = subs.findIndex(function(s) { return s.id === subId; });
    if (idx === -1) return;
    if (dir === "up" && idx > 0) {
        var tmp = subs[idx];
        subs[idx] = subs[idx - 1];
        subs[idx - 1] = tmp;
    } else if (dir === "down" && idx < subs.length - 1) {
        var tmp = subs[idx];
        subs[idx] = subs[idx + 1];
        subs[idx + 1] = tmp;
    } else {
        return;
    }
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        renderSections();
        populateSectionDropdowns();
    });
}

function addSubsection(sectionId) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    var newId = generateSubsectionId();
    var count = subs.length + 1;
    subs.push({id: newId, label: "New Subsection " + count, type: "single"});
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        renderSections();
        populateSectionDropdowns();
    });
}

function removeSubsection(sectionId, subId) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    if (subs.length <= 1) {
        alert("A section must have at least one subsection.");
        return;
    }
    var sub = subs.find(function(s) { return s.id === subId; });
    if (!sub) return;
    if (!confirm('Remove subsection "' + sub.label + '"? Questions with this subsection will have their subsection set to the first available subsection.')) return;
    var remainingSubs = subs.filter(function(s) { return s.id !== subId; });
    section.subsections = remainingSubs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: remainingSubs})
    }).then(function(r) { return r.json(); }).then(function() {
        renderSections();
        populateSectionDropdowns();
    });
}

function updateSubsectionLabel(sectionId, subId, label) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section || !label.trim()) return;
    var subs = getSubsections(section);
    var sub = subs.find(function(s) { return s.id === subId; });
    if (!sub) return;
    sub.label = label.trim();
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        populateSectionDropdowns();
    });
}

function updateSubsectionType(sectionId, subId, type) {
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    var sub = subs.find(function(s) { return s.id === subId; });
    if (!sub) return;
    sub.type = type;
    section.subsections = subs;
    fetch("/api/sections/" + sectionId, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({subsections: subs})
    }).then(function(r) { return r.json(); }).then(function() {
        populateSectionDropdowns();
    });
}

function setupDragReorder() {
    var cards = document.querySelectorAll(".section-card");
    var dragSrc = null;
    cards.forEach(function(card) {
        card.draggable = false;
        var dragHandle = card.querySelector(".drag");
        dragHandle.addEventListener("mousedown", function() { card.draggable = true; });
        dragHandle.addEventListener("mouseup", function() { card.draggable = false; });
        card.addEventListener("dragstart", function(e) {
            dragSrc = card;
            e.dataTransfer.effectAllowed = "move";
            setTimeout(function() { card.style.opacity = "0.4"; }, 0);
        });
        card.addEventListener("dragend", function() {
            card.style.opacity = "1";
            card.draggable = false;
        });
        card.addEventListener("dragover", function(e) { e.preventDefault(); });
        card.addEventListener("drop", function(e) {
            e.preventDefault();
            if (dragSrc && dragSrc !== card) {
                var container = document.getElementById("sectionsContainer");
                container.insertBefore(dragSrc, card);
                saveSectionOrder();
            }
            dragSrc = null;
        });
    });
}

function saveSectionOrder() {
    var cards = document.querySelectorAll(".section-card");
    var orderedIds = Array.from(cards).map(function(c) { return parseInt(c.dataset.id); });
    fetch("/api/sections/reorder", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({orderedIds: orderedIds})
    }).then(function(r) { return r.json(); }).then(function() {
        loadSections();
    });
}

function moveSection(id, dir) {
    var idx = sections.findIndex(function(s) { return s.id === id; });
    if (idx === -1) return;
    if (dir === "up" && idx > 0) {
        var tmp = sections[idx];
        sections[idx] = sections[idx - 1];
        sections[idx - 1] = tmp;
    } else if (dir === "down" && idx < sections.length - 1) {
        var tmp = sections[idx];
        sections[idx] = sections[idx + 1];
        sections[idx + 1] = tmp;
    } else {
        return;
    }
    var orderedIds = sections.map(function(s) { return s.id; });
    fetch("/api/sections/reorder", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({orderedIds: orderedIds})
    }).then(function(r) { return r.json(); }).then(function() {
        loadSections();
    });
}

function addSection() {
    var input = document.getElementById("newSectionName");
    var name = input.value.trim();
    if (!name) { alert("Enter a section name"); return; }
    fetch("/api/sections", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: name})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            input.value = "";
            loadSections();
        } else {
            alert(data.error || "Error creating section");
        }
    });
}

function renameSection(id, newName) {
    var name = newName.trim();
    if (!name) return;
    fetch("/api/sections/" + id, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: name})
    });
}

function deleteSection(id, name) {
    if (!confirm('Delete section "' + name + '"?\nQuestions in this section will become unassigned.')) return;
    fetch("/api/sections/" + id, {method: "DELETE"})
    .then(function(r) { return r.json(); }).then(function() {
        loadSections();
        loadQuestions();
    });
}

/* ========================================= */
/* IMAGE MANAGEMENT                          */
/* ========================================= */

function handleImageUpload(event) {
    var files = event.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(function(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            currentQuestionImages.push({
                id: nextImageId,
                src: e.target.result,
                alt: file.name || "Image"
            });
            nextImageId++;
            renderImageManager();
            updateLivePreview();
        };
        reader.readAsDataURL(file);
    });
    event.target.value = "";
}

function renderImageManager() {
    var container = document.getElementById("imageList");
    if (currentQuestionImages.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:#999">No images uploaded yet.</p>';
        return;
    }
    var html = "";
    currentQuestionImages.forEach(function(img) {
        html += '<div class="image-item">';
        html += '<div class="img-id">#' + img.id + '</div>';
        html += '<img src="' + img.src + '" alt="' + escHtml(img.alt) + '" onclick="copyEmbedCode(' + img.id + ')" title="Click to copy [img:' + img.id + '] embed code">';
        html += '<div class="img-alt">' + escHtml(img.alt) + '</div>';
        html += '<div class="img-actions">';
        html += '<button class="btn-info" onclick="insertImageInText(' + img.id + ')" title="Insert [img:' + img.id + '] in question text">\uD83D\uDCC4 Embed</button>';
        html += '<button class="btn-danger" onclick="removeImage(' + img.id + ')">\u2715</button>';
        html += '</div></div>';
    });
    container.innerHTML = html;
}

function insertImageInText(id) {
    var textarea = document.getElementById("qText");
    var cursorPos = textarea.selectionStart;
    var textBefore = textarea.value.substring(0, cursorPos);
    var textAfter = textarea.value.substring(cursorPos);
    var embed = "[img:" + id + "]";
    textarea.value = textBefore + embed + textAfter;
    textarea.focus();
    textarea.selectionStart = cursorPos;
    textarea.selectionEnd = cursorPos + embed.length;
    updateLivePreview();
}

function removeImage(id) {
    if (!confirm("Remove this image from the question?")) return;
    currentQuestionImages = currentQuestionImages.filter(function(img) { return img.id !== id; });
    renderImageManager();
    updateLivePreview();
}

function copyEmbedCode(id) {
    navigator.clipboard.writeText("[img:" + id + "]").catch(function() {});
}

/* ========================================= */
/* TABLE BUILDER                             */
/* ========================================= */

function addNewTable() {
    var tbl = {
        id: nextTableId,
        caption: "",
        headers: ["Column 1", "Column 2"],
        rows: [["", ""]]
    };
    nextTableId++;
    currentQuestionTables.push(tbl);
    renderTableBuilder();
    updateLivePreview();
}

function renderTableBuilder() {
    var container = document.getElementById("tableList");
    if (currentQuestionTables.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:#999">No tables added yet.</p>';
        return;
    }
    var html = "";
    currentQuestionTables.forEach(function(tbl, ti) {
        html += '<div class="table-list-item">';
        html += '<div style="flex:1">';
        html += '<div style="font-size:12px;font-weight:bold;margin-bottom:4px">Table #' + tbl.id + '</div>';
        html += '<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center">';
        html += '<span style="font-size:11px;color:#888">Caption:</span>';
        html += '<input type="text" value="' + escHtml(tbl.caption || "") + '" onchange="updateTableField(' + ti + ",'caption',this.value)" + '" style="flex:1;padding:4px 6px;border:1px solid #ddd;border-radius:4px;font-size:12px">';
        html += '</div>';
        html += '<div class="table-editor"><table>';
        html += '<tr>';
        tbl.headers.forEach(function(h, hi) {
            html += '<td class="header-cell">';
            html += '<input type="text" value="' + escHtml(h) + '" onchange="updateTableHeader(' + ti + "," + hi + ",this.value)" + '" placeholder="Header ' + (hi + 1) + '">';
            html += '<div class="cell-actions"><button onclick="removeTableColumn(' + ti + "," + hi + ')" title="Remove column">\u2715</button></div>';
            html += '</td>';
        });
        html += '<td class="header-cell" style="width:30px;background:#e8f5e9;cursor:pointer" onclick="addTableColumn(' + ti + ')" title="Add column">+</td>';
        html += '</tr>';
        tbl.rows.forEach(function(row, ri) {
            html += '<tr>';
            row.forEach(function(cell, ci) {
                html += '<td>';
                html += '<input type="text" value="' + escHtml(cell) + '" onchange="updateTableCell(' + ti + "," + ri + "," + ci + ",this.value)" + '" placeholder="...">';
                html += '</td>';
            });
            html += '<td style="width:70px"><div class="cell-actions"><button onclick="removeTableRow(' + ti + "," + ri + ')" title="Remove row">\u2715</button></div></td>';
            html += '</tr>';
        });
        html += '<tr>';
        for (var ci = 0; ci < tbl.headers.length; ci++) {
            html += '<td style="background:#e8f5e9;cursor:pointer;text-align:center;font-size:11px;color:#2e7d32" onclick="addTableRow(' + ti + ')">+</td>';
        }
        html += '<td style="background:#e8f5e9;cursor:pointer;text-align:center;font-size:11px;color:#2e7d32" onclick="addTableRow(' + ti + ')">+</td>';
        html += '</tr>';
        html += '</table></div></div>';
        html += '<div class="tbl-actions">';
        html += '<button class="btn-info" onclick="insertTableInText(' + ti + ')" title="Insert [table:' + tbl.id + '] in question text">\uD83D\uDCC4 Embed</button>';
        html += '<button class="btn-danger" onclick="removeTable(' + ti + ')">\u2715</button>';
        html += '</div></div>';
    });
    container.innerHTML = html;
}

function updateTableField(ti, field, value) {
    if (currentQuestionTables[ti]) {
        currentQuestionTables[ti][field] = value;
    }
    updateLivePreview();
}

function updateTableHeader(ti, hi, value) {
    if (currentQuestionTables[ti] && currentQuestionTables[ti].headers[hi] !== undefined) {
        currentQuestionTables[ti].headers[hi] = value;
    }
    updateLivePreview();
}

function updateTableCell(ti, ri, ci, value) {
    if (currentQuestionTables[ti] && currentQuestionTables[ti].rows[ri] && currentQuestionTables[ti].rows[ri][ci] !== undefined) {
        currentQuestionTables[ti].rows[ri][ci] = value;
    }
    updateLivePreview();
}

function addTableRow(ti) {
    var tbl = currentQuestionTables[ti];
    if (!tbl) return;
    var newRow = [];
    for (var i = 0; i < tbl.headers.length; i++) {
        newRow.push("");
    }
    tbl.rows.push(newRow);
    renderTableBuilder();
    updateLivePreview();
}

function addTableColumn(ti) {
    var tbl = currentQuestionTables[ti];
    if (!tbl) return;
    tbl.headers.push("Column " + (tbl.headers.length + 1));
    tbl.rows.forEach(function(row) { row.push(""); });
    renderTableBuilder();
    updateLivePreview();
}

function removeTableRow(ti, ri) {
    var tbl = currentQuestionTables[ti];
    if (!tbl || tbl.rows.length <= 1) return;
    tbl.rows.splice(ri, 1);
    renderTableBuilder();
    updateLivePreview();
}

function removeTableColumn(ti, ci) {
    var tbl = currentQuestionTables[ti];
    if (!tbl || tbl.headers.length <= 1) return;
    tbl.headers.splice(ci, 1);
    tbl.rows.forEach(function(row) { row.splice(ci, 1); });
    renderTableBuilder();
    updateLivePreview();
}

function insertTableInText(ti) {
    var tbl = currentQuestionTables[ti];
    if (!tbl) return;
    var textarea = document.getElementById("qText");
    var cursorPos = textarea.selectionStart;
    var textBefore = textarea.value.substring(0, cursorPos);
    var textAfter = textarea.value.substring(cursorPos);
    var embed = "[table:" + tbl.id + "]";
    textarea.value = textBefore + embed + textAfter;
    textarea.focus();
    textarea.selectionStart = cursorPos;
    textarea.selectionEnd = cursorPos + embed.length;
    updateLivePreview();
}

function removeTable(ti) {
    if (!confirm("Remove this table from the question?")) return;
    currentQuestionTables.splice(ti, 1);
    renderTableBuilder();
    updateLivePreview();
}

/* ========================================= */
/* LIVE PREVIEW                              */
/* ========================================= */

function updateLivePreview() {
    var type = document.getElementById("qSubsection").value;
    var qText = document.getElementById("qText").value.trim();
    var container = document.getElementById("livePreviewContent");

    if (!qText) {
        container.innerHTML = '<p style="color:#999;font-style:italic">Start typing to see preview with LaTeX, images, and tables rendered...</p>';
        return;
    }

    var rendered = renderContent(qText, currentQuestionImages, currentQuestionTables);

    var options = getOptions();
    if (type !== "numerical" && options.length > 0) {
        rendered += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd">';
        options.forEach(function(op) {
            rendered += '<div class="preview-option">' + renderContent(op, currentQuestionImages, currentQuestionTables) + '</div>';
        });
        rendered += '</div>';
    }

    container.innerHTML = rendered;

    if (window.MathJax) {
        MathJax.typesetPromise([container]).catch(function() {});
    }
}

function renderContent(text, images, tables) {
    if (!text) return "";
    var result = text;

    if (tables && tables.length > 0) {
        tables.forEach(function(tbl) {
            var placeholder = "[table:" + tbl.id + "]";
            if (result.indexOf(placeholder) !== -1) {
                var tableHtml = buildTableHtml(tbl);
                result = result.split(placeholder).join(tableHtml);
            }
        });
    }

    if (images && images.length > 0) {
        images.forEach(function(img) {
            var placeholder = "[img:" + img.id + "]";
            if (result.indexOf(placeholder) !== -1) {
                var imgHtml = '<img src="' + img.src + '" alt="' + escHtml(img.alt) + '" class="preview-img" style="max-width:100%;border-radius:4px;margin:4px 0;display:inline-block;vertical-align:middle">';
                result = result.split(placeholder).join(imgHtml);
            }
        });
    }

    if (images && images.length > 0) {
        images.forEach(function(img) {
            var placeholder = "[img:" + img.id + "]";
            if (text.indexOf(placeholder) === -1) {
                result += '<img src="' + img.src + '" alt="' + escHtml(img.alt) + '" class="preview-img" style="max-width:100%;border-radius:4px;margin:6px 0;display:block">';
            }
        });
    }

    if (tables && tables.length > 0) {
        tables.forEach(function(tbl) {
            var placeholder = "[table:" + tbl.id + "]";
            if (text.indexOf(placeholder) === -1) {
                result += buildTableHtml(tbl);
            }
        });
    }

    // Convert newlines to <br> tags so multi-line text renders properly in HTML
    result = result.replace(/\n/g, '<br>');

    return result;
}

function buildTableHtml(tbl) {
    var html = '<div class="preview-table-wrap"><table>';
    if (tbl.caption) {
        html += '<caption class="tbl-caption">' + escHtml(tbl.caption) + '</caption>';
    }
    html += '<thead><tr>';
    tbl.headers.forEach(function(h) {
        html += '<th>' + escHtml(h) + '</th>';
    });
    html += '</tr></thead><tbody>';
    tbl.rows.forEach(function(row) {
        html += '<tr>';
        row.forEach(function(cell) {
            html += '<td>' + escHtml(cell) + '</td>';
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

function escHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ========================================= */
/* HELPERS - Index/Letter Conversion         */
/* ========================================= */

function indexToLetter(idx) {
    return String.fromCharCode(65 + idx);
}

function letterToIndex(letter) {
    if (!letter || typeof letter !== "string") return NaN;
    return letter.toUpperCase().charCodeAt(0) - 65;
}

/* ========================================= */
/* QUESTIONS                                 */
/* ========================================= */

function toggleOptions() {
    var type = getSelectedSubsectionType();
    var area = document.getElementById("optionsArea");
    var answerLabel = document.querySelector("#answerGroup label");
    var answerInput = document.getElementById("qAnswer");
    if (type === "numerical") {
        area.style.display = "none";
        answerLabel.textContent = "Correct Answer (number)";
        answerInput.placeholder = "Enter the numerical answer";
    } else {
        area.style.display = "block";
        answerLabel.textContent = "Correct Answer";
        if (type === "single") {
            answerInput.placeholder = "Letter of correct option (e.g. A, B, C, D)";
        } else {
            answerInput.placeholder = "Comma-separated letters (e.g. A, C, D)";
        }
    }
    var optContainer = document.getElementById("optionsContainer");
    if (!optContainer.children.length) {
        addOption();
        if (type === "single") addOption();
    }
}

function getSelectedSubsectionType() {
    var subId = document.getElementById("qSubsection")?.value;
    if (!subId) return "single";
    var sectionId = parseInt(document.getElementById("qSection")?.value);
    if (!sectionId) return "single";
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return "single";
    var subs = getSubsections(section);
    var sub = subs.find(function(s) { return s.id === subId; });
    return sub ? sub.type : "single";
}

function addOption(value) {
    if (value === undefined) value = "";
    var container = document.getElementById("optionsContainer");
    var row = document.createElement("div");
    row.className = "option-row";
    var textarea = document.createElement("textarea");
    textarea.placeholder = "Option " + (container.children.length + 1) + " (supports \\(...\\) LaTeX, [img:N], [table:N])";
    textarea.value = value;
    textarea.className = "option-input";
    textarea.oninput = function() { updateLivePreview(); };
    var delBtn = document.createElement("button");
    delBtn.textContent = "\u2715";
    delBtn.onclick = function() { row.remove(); updateLivePreview(); };
    row.appendChild(textarea);
    row.appendChild(delBtn);
    container.appendChild(row);
    updateLivePreview();
}

function getOptions() {
    var inputs = document.querySelectorAll(".option-input");
    var result = [];
    inputs.forEach(function(inp) {
        var v = inp.value.trim();
        if (v !== "") result.push(v);
    });
    return result;
}

function getAnswerForType(type) {
    var val = document.getElementById("qAnswer").value.trim();
    if (type === "single") return letterToIndex(val);
    if (type === "multi") {
        return val.split(",").map(function(s) { return letterToIndex(s.trim()); }).filter(function(n) { return !isNaN(n); });
    }
    if (type === "numerical") return parseFloat(val);
    return val;
}

function saveQuestion() {
    var subId = document.getElementById("qSubsection").value;
    var sectionId = parseInt(document.getElementById("qSection").value);
    var qText = document.getElementById("qText").value.trim();
    var editId = document.getElementById("editId").value;
    var totalMarks = parseFloat(document.getElementById("qTotalMarks").value) || 4;
    var negativeMarks = parseFloat(document.getElementById("qNegativeMarks").value) || 1;
    var type = getSelectedSubsectionType();

    if (!sectionId) { alert("Please select a section."); return; }
    if (!qText) { alert("Please enter the question text."); return; }
    if (!subId) { alert("Please select a subsection."); return; }

    var questionData = {
        sectionId: sectionId,
        subsection: subId,
        type: type,
        question: qText,
        options: type === "numerical" ? [] : getOptions(),
        answer: getAnswerForType(type),
        totalMarks: totalMarks,
        negativeMarks: negativeMarks,
        images: currentQuestionImages,
        tables: currentQuestionTables
    };

    if (type !== "numerical" && questionData.options.length < 2) {
        alert("Please add at least 2 options.");
        return;
    }

    var answerIsEmpty = (questionData.answer === undefined || questionData.answer === null || questionData.answer === "");
    var answerIsEmptyArray = (Array.isArray(questionData.answer) && questionData.answer.length === 0);
    if (answerIsEmpty || answerIsEmptyArray) {
        alert("Please enter the correct answer.");
        return;
    }

    var url = editId ? "/api/questions/" + editId : "/api/questions";
    var method = editId ? "PUT" : "POST";

    fetch(url, {
        method: method,
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(questionData)
    }).then(function(res) {
        if (!res.ok) throw new Error("Server error: " + res.status);
        return res.json();
    }).then(function() {
        loadQuestions();
        resetForm();
    }).catch(function(err) {
        console.error("Save error:", err);
        alert("Error saving question: " + err.message);
    });
}

function editQuestion(id) {
    var q = questions.find(function(item) { return item.id === id; });
    if (!q) { alert("Question not found"); return; }
    document.getElementById("formTitle").textContent = "Edit Question";
    document.getElementById("editId").value = q.id;
    document.getElementById("qSection").value = q.sectionId || "";
    populateSubsectionDropdown();
    document.getElementById("qSubsection").value = q.subsection || q.type || "";
    document.getElementById("qText").value = q.question;
    document.getElementById("qTotalMarks").value = q.totalMarks != null ? q.totalMarks : 4;
    document.getElementById("qNegativeMarks").value = q.negativeMarks != null ? q.negativeMarks : 1;
    toggleOptions();

    var container = document.getElementById("optionsContainer");
    container.innerHTML = "";
    if (q.type !== "numerical" && q.options) {
        q.options.forEach(function(opt) { addOption(opt); });
    }

    if (q.type === "single") {
        document.getElementById("qAnswer").value = indexToLetter(q.answer);
    } else if (q.type === "multi") {
        document.getElementById("qAnswer").value = q.answer.map(function(a) { return indexToLetter(a); }).join(",");
    } else {
        document.getElementById("qAnswer").value = q.answer;
    }

    currentQuestionImages = [];
    nextImageId = 0;
    if (q.images && Array.isArray(q.images)) {
        q.images.forEach(function(img) {
            currentQuestionImages.push({
                id: nextImageId,
                src: img.src,
                alt: img.alt || "Image"
            });
            nextImageId++;
        });
    }
    renderImageManager();

    currentQuestionTables = [];
    nextTableId = 0;
    if (q.tables && Array.isArray(q.tables)) {
        q.tables.forEach(function(tbl) {
            currentQuestionTables.push({
                id: nextTableId,
                caption: tbl.caption || "",
                headers: tbl.headers || ["Column 1", "Column 2"],
                rows: tbl.rows || [["", ""]]
            });
            nextTableId++;
        });
    }
    renderTableBuilder();

    document.getElementById("cancelBtn").style.display = "inline-block";
    window.scrollTo({top: 0, behavior: "smooth"});
    updateLivePreview();
}

function deleteQuestion(id) {
    if (!confirm("Delete this question?")) return;
    fetch("/api/questions/" + id, {method: "DELETE"})
    .then(function(r) { return r.json(); }).then(function() { loadQuestions(); });
}

function cancelEdit() { resetForm(); }

function resetForm() {
    document.getElementById("formTitle").textContent = "Add New Question";
    document.getElementById("editId").value = "";
    document.getElementById("qText").value = "";
    document.getElementById("qAnswer").value = "";
    document.getElementById("qTotalMarks").value = "4";
    document.getElementById("qNegativeMarks").value = "1";
    document.getElementById("cancelBtn").style.display = "none";
    if (sections.length > 0) {
        document.getElementById("qSection").value = sections[0].id;
        populateSubsectionDropdown();
    }
    document.getElementById("optionsContainer").innerHTML = "";

    currentQuestionImages = [];
    currentQuestionTables = [];
    nextImageId = 0;
    nextTableId = 0;
    renderImageManager();
    renderTableBuilder();

    toggleOptions();
    updateLivePreview();
}

function populateSectionDropdowns() {
    var selSection = document.getElementById("qSection");
    var selFilter = document.getElementById("filterSection");
    if (selSection) {
        var currentVal = selSection.value;
        selSection.innerHTML = '<option value="">Select section...</option>';
        sections.forEach(function(s) {
            selSection.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
        });
        if (currentVal) selSection.value = currentVal;
        else if (sections.length > 0) selSection.value = sections[0].id;
    }
    if (selFilter) {
        var currentFilter = selFilter.value;
        selFilter.innerHTML = '<option value="">All Sections</option>';
        sections.forEach(function(s) {
            selFilter.innerHTML += '<option value="' + s.id + '">' + s.name + '</option>';
        });
        if (currentFilter) selFilter.value = currentFilter;
    }
    populateSubsectionDropdown();
}

function populateSubsectionDropdown() {
    var selSub = document.getElementById("qSubsection");
    var selSection = document.getElementById("qSection");
    if (!selSub || !selSection) return;
    var sectionId = parseInt(selSection.value);
    var currentVal = selSub.value;
    selSub.innerHTML = '';
    if (!sectionId) {
        selSub.innerHTML = '<option value="">Select a section first</option>';
        return;
    }
    var section = sections.find(function(s) { return s.id === sectionId; });
    if (!section) return;
    var subs = getSubsections(section);
    subs.forEach(function(sub) {
        var sel = (sub.id === currentVal) ? ' selected' : '';
        selSub.innerHTML += '<option value="' + sub.id + '"' + sel + '>' + escHtml(sub.label) + '</option>';
    });
    if (!currentVal && subs.length > 0) {
        selSub.value = subs[0].id;
    }
    toggleOptions();
}

function onSectionChange() {
    populateSubsectionDropdown();
    updateLivePreview();
}

function loadQuestions() {
    fetch("/api/questions").then(function(r) { return r.json(); }).then(function(data) {
        questions = data;
        renderQuestions();
        var tabSections = document.getElementById("tab-sections");
        if (tabSections && tabSections.classList.contains("active")) renderSections();
    });
}

function renderQuestions() {
    var container = document.getElementById("questionsContainer");
    var filterSection = document.getElementById("filterSection").value;
    var filtered = questions;
    if (filterSection) {
        filtered = filtered.filter(function(q) { return q.sectionId === parseInt(filterSection); });
    }
    if (filtered.length === 0) {
        container.innerHTML = '<div class="no-data">No questions found.</div>';
        return;
    }
    var html = "";
    filtered.forEach(function(q, index) {
        var sectionName = "Unassigned";
        var sec = sections.find(function(s) { return s.id === q.sectionId; });
        if (sec) {
            sectionName = sec.name;
            var subs = getSubsections(sec);
            var sub = subs.find(function(s) { return s.id === (q.subsection || q.type); });
            if (sub) sectionName += ' \u2192 ' + sub.label;
        }
        
        var typeLabels = {single: "SCQ", multi: "MCQ", numerical: "Numerical"};
        var typeClass = {single: "q-badge-scq", multi: "q-badge-mcq", numerical: "q-badge-numerical"};
        var hasImages = q.images && q.images.length > 0;
        var hasTables = q.tables && q.tables.length > 0;

        var answerDisplay = "";
        if (q.type === "single") {
            answerDisplay = "Answer: Option " + indexToLetter(q.answer) + " (" + (q.options[q.answer] || "") + ")";
        } else if (q.type === "multi") {
            var ansText = q.answer.map(function(a) { return "Option " + indexToLetter(a) + " (" + (q.options[a] || "") + ")"; }).join(", ");
            answerDisplay = "Answer: " + ansText;
        } else {
            answerDisplay = "Answer: " + q.answer;
        }

        var marksInfo = 'Marks: +' + (q.totalMarks || 4) + ' / -' + (q.negativeMarks || 1);

        var displayText = q.question;
        if (displayText.length > 200) displayText = displayText.substring(0, 200) + "...";

        html += '<div class="question-card">';
        html += '<div class="q-header">';
        html += '<div class="q-title">Q' + (index + 1) + ' (ID: ' + q.id + ')</div>';
        html += '<div class="q-badges">';
        html += '<span class="q-badge q-badge-section">' + sectionName + '</span>';
        html += '<span class="q-badge ' + (typeClass[q.type] || "") + '">' + (typeLabels[q.type] || q.type) + '</span>';
        html += '<span class="q-badge q-badge-marks">' + marksInfo + '</span>';
        if (hasImages) html += '<span class="q-badge q-badge-image">\uD83D\uDDBC\uFE0F ' + q.images.length + '</span>';
        if (hasTables) html += '<span class="q-badge q-badge-image">\uD83D\uDCCA ' + q.tables.length + '</span>';
        html += '</div></div>';
        html += '<div class="q-text">';
        if (mathPreviewOn) {
            html += displayText;
        } else {
            html += displayText.replace(/\\\\\(/g, "[").replace(/\\\\\)/g, "]");
        }
        html += '</div>';
        html += '<div class="q-answer">' + answerDisplay + '</div>';
        html += '<div class="q-actions">';
        html += '<button class="btn-edit" onclick="editQuestion(' + q.id + ')">Edit</button>';
        html += '<button class="btn-danger" onclick="deleteQuestion(' + q.id + ')">Delete</button>';
        html += '</div></div>';
    });
    container.innerHTML = html;
    if (window.MathJax && mathPreviewOn) MathJax.typesetPromise();
}

function toggleMathPreview() {
    mathPreviewOn = !mathPreviewOn;
    renderQuestions();
}

/* ========================================= */
/* BULK IMPORT                               */
/* ========================================= */

function showBulkImport() {
    document.getElementById("bulkImportArea").style.display = "block";
    document.getElementById("bulkResult").textContent = "";
}

function bulkImport() {
    var raw = document.getElementById("bulkData").value.trim();
    if (!raw) { alert("Paste some question data first."); return; }
    var parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        alert("Invalid JSON: " + e.message);
        return;
    }
    if (!Array.isArray(parsed)) { alert("Data must be a JSON array."); return; }
    fetch("/api/questions/bulk", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({questions: parsed})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            document.getElementById("bulkResult").innerHTML = '<span style="color:#2e7d32">\u2705 Imported ' + data.imported + ' question(s) successfully!</span>';
            loadQuestions();
            document.getElementById("bulkData").value = "";
        } else {
            document.getElementById("bulkResult").innerHTML = '<span style="color:#d32f2f">Error: ' + data.error + '</span>';
        }
    });
}

/* ========================================= */
/* SETTINGS                                  */
/* ========================================= */

function loadConfig() {
    fetch("/api/config").then(function(r) { return r.json(); }).then(function(config) {
        var totalSecs = config.examDuration || 5400;
        document.getElementById("timerHours").value = Math.floor(totalSecs / 3600);
        document.getElementById("timerMinutes").value = Math.floor((totalSecs % 3600) / 60);
        document.getElementById("configStatus").textContent = "";
    });
}

function saveConfig() {
    var hours = parseInt(document.getElementById("timerHours").value) || 0;
    var minutes = parseInt(document.getElementById("timerMinutes").value) || 0;
    var totalSeconds = hours * 3600 + minutes * 60;
    if (totalSeconds < 60) { alert("Timer must be at least 1 minute."); return; }
    fetch("/api/config", {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({examDuration: totalSeconds})
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            document.getElementById("configStatus").textContent = "\u2705 Timer saved! (" + hours + "h " + minutes + "m)";
        }
    });
}

function viewResults() {
    fetch("/api/results").then(function(r) { return r.json(); }).then(function(results) {
        var container = document.getElementById("resultsContainer");
        if (!results || results.length === 0) {
            container.innerHTML = '<span style="color:#888">No results saved yet.</span>';
            return;
        }
        var html = '<div style="margin-bottom:8px;font-size:12px;color:#888">' + results.length + ' submission(s). Click 🗑 to delete an entry — the email can then retake the test.</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
        html += '<thead><tr style="background:#e3f2fd">';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:left">Email</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">Score</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">%</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">Time</th>';
        html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:center">Action</th>';
        html += '</tr></thead><tbody>';
        results.forEach(function(r) {
            html += '<tr style="border-bottom:1px solid #eee">';
            html += '<td style="padding:6px 10px;border:1px solid #ddd">' + escHtml(r.email) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center">' + escHtml(r.score) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center">' + escHtml(r.percentage) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center">' + escHtml(r.time) + '</td>';
            html += '<td style="padding:6px 10px;border:1px solid #ddd;text-align:center"><button class="btn-danger" onclick="deleteResult(\'' + escHtml(r.email) + '\')" style="font-size:11px;padding:3px 8px">🗑</button></td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        html += '<div id="deleteStatus" style="margin-top:8px;font-size:12px"></div>';
        container.innerHTML = html;
    }).catch(function() {
        document.getElementById("resultsContainer").innerHTML = '<span style="color:#888">Failed to load results.</span>';
    });
}

function deleteResult(email) {
    if (!confirm('Delete all submissions for "' + email + '"?\nThey will be able to retake the test.')) return;
    fetch("/api/results/" + encodeURIComponent(email), {
        method: "DELETE"
    }).then(function(r) { return r.json(); }).then(function(data) {
        var status = document.getElementById("deleteStatus");
        if (data.success && data.removed > 0) {
            status.innerHTML = '<span style="color:#2e7d32">✅ Removed ' + data.removed + ' submission(s) for ' + escHtml(email) + '. They can now retake the test.</span>';
            viewResults();
        } else if (data.success && data.removed === 0) {
            status.innerHTML = '<span style="color:#888">No submissions found for ' + escHtml(email) + '.</span>';
        } else {
            status.innerHTML = '<span style="color:#d32f2f">Error deleting submission.</span>';
        }
    }).catch(function() {
        document.getElementById("deleteStatus").innerHTML = '<span style="color:#d32f2f">Error deleting submission.</span>';
    });
}

/* ========================================= */
/* PREVIEW                                   */
/* ========================================= */

function loadPreview() {
    var container = document.getElementById("previewContainer");
    if (sections.length === 0) {
        container.innerHTML = '<div class="no-data">No sections created yet. Go to the Sections tab to add some.</div>';
        return;
    }
    if (questions.length === 0) {
        container.innerHTML = '<div class="no-data">No questions added yet.</div>';
        return;
    }
    var html = "";
    var globalQNum = 1;
    sections.forEach(function(s) {
        var subs = getSubsections(s);
        var secQuestions = questions.filter(function(q) { return q.sectionId === s.id; });
        if (secQuestions.length === 0) return;
        html += '<div class="preview-section"><h2>\uD83D\uDCC2 ' + s.name + '</h2>';
        subs.forEach(function(sub) {
            var subQs = secQuestions.filter(function(q) { return (q.subsection || q.type) === sub.id; });
            if (subQs.length === 0) return;
            html += '<div class="preview-subsection"><h3>' + escHtml(sub.label) + ' (' + subQs.length + ')</h3>';
            subQs.forEach(function(q) {
                var marksInfo = ' (Marks: +' + (q.totalMarks || 4) + ' / -' + (q.negativeMarks || 1) + ')';
                var qHtml = '<span class="pq-num">Q' + globalQNum + '.</span> ';
                qHtml += renderContent(q.question, q.images || [], q.tables || []);
                html += '<div class="preview-q">' + qHtml + '<span class="preview-marks">' + marksInfo + '</span></div>';
                globalQNum++;
            });
            html += '</div>';
        });
        html += '</div>';
    });
    if (html === "") {
        html = '<div class="no-data">No questions assigned to any section.</div>';
    }
    container.innerHTML = html;
    if (window.MathJax) MathJax.typesetPromise();
}

/* ========================================= */
/* INIT                                      */
/* ========================================= */

function initAdmin() {
    fetch("/api/sections").then(function(r) { return r.json(); }).then(function(data) {
        sections = data;
        populateSectionDropdowns();
        return fetch("/api/questions").then(function(r) { return r.json(); });
    }).then(function(data) {
        questions = data;
        renderQuestions();
        toggleOptions();
        if (sections.length > 0) document.getElementById("qSection").value = sections[0].id;
        renderImageManager();
        renderTableBuilder();
        updateLivePreview();
    }).catch(function(err) {
        console.error("Init error:", err);
    });
}

document.addEventListener("DOMContentLoaded", function() {
    if (sessionStorage.getItem("adminLoggedIn") === "true") {
        document.getElementById("loginOverlay").style.display = "none";
        document.getElementById("adminContainer").style.display = "block";
        initAdmin();
    }
});
