"use strict";

let questions = [];
let sections = [];
let examDuration = 5400;
let totalSeconds = 5400;
let currentEmail = "";
let current = 0;
let submitted = false;
let userAnswers = [];
let markedForReview = [];
let visited = [];
let timerInterval = null;
let subsectionInstructionsShown = {};

/* ========================================= */
/* CONTENT RENDERER - Images & Tables */
/* ========================================= */

function renderQuestionContent(text, images, tables){
    if(!text) return "";
    let result = text;
    
    // Replace [table:N] with actual table HTML
    if(tables && tables.length > 0){
        tables.forEach(tbl => {
            const placeholder = `[table:${tbl.id}]`;
            if(result.includes(placeholder)){
                const tableHtml = buildQuizTableHtml(tbl);
                result = result.split(placeholder).join(tableHtml);
            }
        });
    }
    
    // Replace [img:N] with actual image HTML
    if(images && images.length > 0){
        images.forEach(img => {
            const placeholder = `[img:${img.id}]`;
            if(result.includes(placeholder)){
                const imgHtml = `<img src="${img.src}" alt="${img.alt || ''}" class="question-image" style="max-width:100%;border-radius:6px;margin:6px 0;display:inline-block;vertical-align:middle">`;
                result = result.split(placeholder).join(imgHtml);
            }
        });
    }
    
    // Append unplaced images at the end
    if(images && images.length > 0){
        images.forEach(img => {
            const placeholder = `[img:${img.id}]`;
            if(!text.includes(placeholder)){
                result += `<img src="${img.src}" alt="${img.alt || ''}" class="question-image" style="max-width:100%;border-radius:6px;margin:6px 0;display:block">`;
            }
        });
    }
    
    // Append unplaced tables at the end
    if(tables && tables.length > 0){
        tables.forEach(tbl => {
            const placeholder = `[table:${tbl.id}]`;
            if(!text.includes(placeholder)){
                result += buildQuizTableHtml(tbl);
            }
        });
    }
    
    // Convert newlines to <br> tags so multi-line text renders properly in HTML
    result = result.replace(/\n/g, '<br>');
    
    return result;
}

function buildQuizTableHtml(tbl){
    if(!tbl || !tbl.headers) return "";
    let html = '<div class="question-table-wrap" style="margin:10px 0;overflow-x:auto"><table style="border-collapse:collapse;width:auto;min-width:200px;margin:auto">';
    if(tbl.caption){
        html += `<caption style="font-size:12px;color:#666;font-style:italic;margin-bottom:4px">${escHtml(tbl.caption)}</caption>`;
    }
    html += '<thead><tr>';
    tbl.headers.forEach(h => {
        html += `<th style="border:1px solid #bbb;padding:8px 12px;background:#e3f2fd;font-weight:bold;text-align:center;font-size:13px">${escHtml(h)}</th>`;
    });
    html += '</tr></thead><tbody>';
    if(tbl.rows){
        tbl.rows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td style="border:1px solid #bbb;padding:8px 12px;text-align:center;font-size:13px">${escHtml(cell)}</td>`;
            });
            html += '</tr>';
        });
    }
    html += '</tbody></table></div>';
    return html;
}

function escHtml(str){
    if(!str) return "";
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
}

/* ========================================= */
/* SECTION / SUBSECTION HELPERS */
/* ========================================= */

function getQuestionSection(index){
    const q = questions[index];
    if(!q) return null;
    return sections.find(s => s.id === q.sectionId) || null;
}

function getQuestionSubsection(index){
    const q = questions[index];
    if(!q) return null;
    const sec = getQuestionSection(index);
    if(!sec) return null;
    const subs = getSectionSubsections(sec);
    return subs.find(sub => sub.id === (q.subsection || q.type)) || null;
}

function getSectionById(id){
    return sections.find(s => s.id === id) || null;
}

/* ========================================= */
/* SECTION INSTRUCTIONS POPUP */
/* ========================================= */

function showSectionInstructions(sectionId, subId, callback){
    // Handle optional subId parameter
    if(typeof subId === 'function') {
        callback = subId;
        subId = null;
    }

    const sec = getSectionById(sectionId);
    if(!sec) {
        if(callback) callback();
        return;
    }

    // Build section/subsection-specific instructions HTML
    const html = generateSectionInstructionsHtml(sec, subId);

    // Use the existing instructions overlay but populate with section-specific content
    const overlay = document.getElementById("instructionsOverlay");
    const body = document.getElementById("instructionsBody");
    const header = document.querySelector("#instructionsHeader h1");
    const continueBtn = document.getElementById("continueBtn");

    // Store the original header
    const originalHeader = header.textContent;

    if(subId) {
        const subs = getSectionSubsections(sec);
        const sub = subs.find(s => s.id === subId);
        header.textContent = `📋 ${escHtml(sub ? sub.label : subId)} - Instructions`;
    } else {
        header.textContent = `📋 ${sec.name} - Instructions`;
    }

    body.innerHTML = html;

    // Replace continue button behavior
    continueBtn.textContent = "▶ Start";
    continueBtn.onclick = function(){
        overlay.style.display = "none";
        header.textContent = originalHeader;
        continueBtn.textContent = "▶ Continue Test";
        continueBtn.onclick = continueToTest;
        if(callback) callback();
    };

    overlay.style.display = "flex";

    if(window.MathJax){
        MathJax.typesetPromise();
    }
}

function generateSectionInstructionsHtml(sec, subId){
    if(!sec) return '';

    const subs = getSectionSubsections(sec);
    const secQuestions = questions.filter(q => q.sectionId === sec.id);
    if(secQuestions.length === 0) return '<p>No questions in this section.</p>';

    let html = '';

    if(subId) {
        /* --- Subsection-specific instructions --- */
        const sub = subs.find(s => s.id === subId);
        if(!sub) return '<p>Subsection not found.</p>';

        const subQs = secQuestions.filter(q => (q.subsection || q.type) === subId);
        const typeInfo = getTypeInfo(sub.type || subId, sub.label);

        html += '<div class="instruction-card">';
        html += '<h2>📋 ' + escHtml(sec.name) + ' › ' + escHtml(sub.label) + '</h2>';
        let badgeHtml = typeInfo ? '<span class="type-badge ' + typeInfo.badgeClass + '">' + typeInfo.shortLabel + '</span> ' : '';
        html += '<p>' + badgeHtml + '<strong>' + escHtml(sub.label) + '</strong></p>';
        html += '<p>Number of questions: <strong>' + subQs.length + '</strong></p>';
        if(typeInfo) {
            html += '<p>Type: ' + typeInfo.description + '</p>';
        }
        html += '</div>';

        /* Marks for this subsection */
        let totalMarksSum = 0, negMarksSum = 0;
        subQs.forEach(q => {
            totalMarksSum += getQuestionTotalMarks(q);
            negMarksSum += getQuestionNegativeMarks(q);
        });
        const avgTotal = (totalMarksSum / subQs.length).toFixed(1);
        const avgNeg = (negMarksSum / subQs.length).toFixed(1);

        html += '<div class="instruction-card">';
        html += '<h2>📊 Marking Scheme</h2>';
        html += '<div class="marking-table-wrap"><table class="marking-table"><thead><tr><th>Result</th><th>Marks</th></tr></thead><tbody>';
        html += '<tr><td>✅ Correct answer</td><td class="marks-positive">+' + avgTotal + '</td></tr>';
        html += '<tr><td>❌ Incorrect answer</td><td class="marks-negative">-' + avgNeg + '</td></tr>';
        html += '<tr><td>⏭️ Not attempted</td><td class="marks-neutral">0</td></tr>';
        html += '</tbody></table></div>';
        html += '</div>';
    } else {
        /* --- Section overview (condensed) --- */
        html += '<div class="instruction-card">';
        html += '<h2>📂 ' + escHtml(sec.name) + '</h2>';
        html += '<p>Total questions: <strong>' + secQuestions.length + '</strong></p>';
        html += '<p>Subsections: ' + subs.map(sub => escHtml(sub.label)).join(', ') + '</p>';
        html += '</div>';
    }

    return html;
}

/* LOAD DATA FROM SERVER */

async function loadQuestionsFromServer(){

    document.getElementById("startBtn").disabled = true;
    document.getElementById("startBtn").textContent = "Loading...";

    try{
        const [qRes, sRes, cRes] = await Promise.all([
            fetch("/api/questions"),
            fetch("/api/sections"),
            fetch("/api/config")
        ]);

        if(!qRes.ok) throw new Error("Questions server returned "+qRes.status);
        if(!sRes.ok) throw new Error("Sections server returned "+sRes.status);
        if(!cRes.ok) throw new Error("Config server returned "+cRes.status);

        const qData = await qRes.json();
        const sData = await sRes.json();
        const cData = await cRes.json();

        questions = qData;
        sections = sData;
        examDuration = cData.examDuration || 5400;
        totalSeconds = examDuration;

        updateTimerDisplay();

        document.getElementById("startBtn").disabled = false;
        document.getElementById("startBtn").textContent = "Start Test";

        initQuiz();
    }

    catch(err){
        console.error("Failed to load data",err);
        document.getElementById("loginPage").innerHTML =
        "<h1>Error loading data.</h1><p>Make sure the server is running.</p>";
    }
}

function saveProgress(){

    if(currentEmail==="")
        return;

    const progressData = {

        answers:userAnswers,

        review:markedForReview,

        time:totalSeconds,

        current:current
    };

    localStorage.setItem(

        "progress_" + currentEmail,

        JSON.stringify(progressData)
    );
}

/* ========================================= */
/* LOGIN SYSTEM */
/* ========================================= */

async function startQuiz(){

    const email =

    document.getElementById(
        "emailInput"
    )
    .value
    .trim()
    .toLowerCase();

    const emailPattern =

/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if(email===""){

        await showModal("Enter Email");

        return;
    }

    if(!emailPattern.test(email)){

        await showModal(
        "Enter Valid Email Address"
        );

        return;
    }

    currentEmail = email;

    fetch("/check-email",{

        method:"POST",

        headers:{
            "Content-Type":
            "application/json"
        },

        body:JSON.stringify({
            email:currentEmail
        })
    })

    .then(res=>res.json())

    .then(async function(data){

        /* ALREADY GAVE TEST */

        if(data.exists){

    const oldResult =

    localStorage.getItem(
        "quiz_" + email
    );

    if(oldResult){

        showPreviousResult(

            JSON.parse(oldResult)
        );
    }

    else{

        await showModal(
        "This email already gave the test."
        );
    }

    return;
}

        const savedProgress =

        localStorage.getItem(
            "progress_" + email
        );

        /* SHOW INSTRUCTIONS FIRST */

        document.getElementById(
            "loginPage"
        ).style.display="none";

        /* Enter fullscreen mode immediately after starting */
        enterFullscreen();

        /* RESTORE — skip instructions if resuming */

        if(savedProgress){

            const data =
            JSON.parse(savedProgress);

            userAnswers =
            data.answers;

            markedForReview =
            data.review;

            totalSeconds =
            data.time;

            current =
            data.current;

            document.getElementById(
                "quizContainer"
            ).style.display="flex";

            restoreAnswers();

            gotoQuestion(current);

            for(
                let i=0;
                i<questions.length;
                i++
            ){

                updateNavColor(i);
            }

            updateTimerDisplay();

            startTimer();

            enterFullscreen();

            return;
        }

        /* NEW TEST — show first subsection instructions instead of general overview */

        const firstSection = sections[0];
        if(firstSection) {
            const subs = getSectionSubsections(firstSection);
            if(subs.length > 0) {
                const firstSub = subs[0];
                const subKey = firstSection.id + '_' + firstSub.id;
                subsectionInstructionsShown[subKey] = true;
                showSectionInstructions(firstSection.id, firstSub.id, function(){
                    continueToTest();
                    gotoQuestion(0, false);
                });
            } else {
                buildInstructionsContent();
                document.getElementById("instructionsOverlay").style.display="flex";
            }
        } else {
            buildInstructionsContent();
            document.getElementById("instructionsOverlay").style.display="flex";
        }
    });
}

/* ========================================= */
/* INSTRUCTIONS OVERLAY                      */
/* ========================================= */

function getSectionSubsections(section){
    if(section.subsections && Array.isArray(section.subsections) && section.subsections.length > 0){
        return section.subsections;
    }
    const defaultLabels = {single:"Single Correct (SCQ)", multi:"Multiple Correct Questions", numerical:"Integer / Numerical"};
    const defaultTypes = {single:"single", multi:"multi", numerical:"numerical"};
    const order = section.subsectionOrder || ["single","multi","numerical"];
    return order.map(id => ({
        id: id,
        label: defaultLabels[id] || id,
        type: defaultTypes[id] || id
    }));
}

function getQuestionTotalMarks(q){
    return (q.totalMarks != null ? Number(q.totalMarks) : 4);
}

function getQuestionNegativeMarks(q){
    return (q.negativeMarks != null ? Number(q.negativeMarks) : 1);
}

function generateInstructionsHtml(qData, secData, showNavigation){
    if (!qData || !Array.isArray(qData) || qData.length === 0) return '';
    if (!secData || !Array.isArray(secData)) secData = [];

    let html = "";

    /* Compute aggregate marks from all questions */
    let defaultTotal = 4, defaultNeg = 1;
    let totalMarksSum = 0, negMarksSum = 0, qCount = qData.length;
    if(qCount > 0){
        qData.forEach(q => {
            totalMarksSum += getQuestionTotalMarks(q);
            negMarksSum += getQuestionNegativeMarks(q);
        });
        defaultTotal = (totalMarksSum / qCount).toFixed(1);
        defaultNeg = (negMarksSum / qCount).toFixed(1);
    }

    /* SECTIONS */
    html += '<div class="instruction-card">';
    html += '<h2>\uD83D\uDCC2 Sections</h2>';
    html += '<p>The test has the following sections:</p>';
    html += '<ul class="instruction-list">';
    secData.forEach(section => {
        var subs = getSectionSubsections(section);
        var count = qData.filter(function(q){ return q.sectionId === section.id; }).length;
        var subLabels = subs.map(function(sub){ return sub.label; }).join(", ");
        html += '<li><strong>' + escHtml(section.name) + '</strong> \u2014 ' + count + ' question' + (count !== 1 ? 's' : '') + '<br><span class="instruction-sub">Types: ' + subLabels + '</span></li>';
    });
    html += '</ul></div>';

    /* QUESTION TYPES */
    var seenTypes = {};
    var typeCards = "";
    secData.forEach(section => {
        var subs = getSectionSubsections(section);
        subs.forEach(sub => {
            if(seenTypes[sub.id]) return;
            seenTypes[sub.id] = true;
            var typeInfo = getTypeInfo(sub.type, sub.label);
            if(typeInfo){
                typeCards += '<li><span class="type-badge ' + typeInfo.badgeClass + '">' + typeInfo.shortLabel + '</span><strong>' + escHtml(sub.label) + '</strong> \u2014 ' + typeInfo.description + '</li>';
            }
        });
    });
    html += '<div class="instruction-card">';
    html += '<h2>\uD83D\uDCCB Question Types</h2>';
    html += '<ul class="instruction-list instruction-types">' + typeCards + '</ul></div>';

    /* MARKING SCHEME */
    var totalMarkDisplay = Number.isInteger(Number(defaultTotal)) ? Number(defaultTotal) : defaultTotal;
    var negMarkDisplay = Number.isInteger(Number(defaultNeg)) ? Number(defaultNeg) : defaultNeg;

    html += '<div class="instruction-card">';
    html += '<h2>\uD83D\uDCCA Marking Scheme</h2>';
    html += '<div class="marking-table-wrap"><table class="marking-table"><thead><tr><th>Result</th><th>Marks</th></tr></thead><tbody>';
    html += '<tr><td>\u2705 Correct answer</td><td class="marks-positive">+' + totalMarkDisplay + '</td></tr>';
    html += '<tr><td>\u274C Incorrect answer</td><td class="marks-negative">-' + negMarkDisplay + '</td></tr>';
    html += '<tr><td>\u23ED\uFE0F Not attempted</td><td class="marks-neutral">0</td></tr>';
    html += '<tr><td>\u26A0\uFE0F Multiple Correct \u2014 partially correct</td><td class="marks-partial">+' + totalMarkDisplay + ' \u00D7 (correct / total)</td></tr>';    html += '</tbody></table></div>';
    html += '</div>';

    /* NAVIGATION GUIDE - only in on-screen overlay, not in QP PDF */
    if (showNavigation !== false) {
    html += '<div class="instruction-card">';
    html += '<h2>\uD83E\uDDED Navigation</h2>';
    html += '<ul class="instruction-list">';
    html += '<li><span class="nav-dot green-dot"></span><strong>Green</strong> \u2014 Answered</li>';
    html += '<li><span class="nav-dot red-dot"></span><strong>Red</strong> \u2014 Visited but not answered</li>';
    html += '<li><span class="nav-dot yellow-dot"></span><strong>Yellow</strong> \u2014 Marked for review</li>';
    html += '<li><span class="nav-dot white-dot"></span><strong>White</strong> \u2014 Not visited</li>';
    html += '</ul></div>';
    }

    return html;
}

function buildInstructionsContent(){
    var html = generateInstructionsHtml(questions, sections);
    document.getElementById(
        "instructionsBody"
    ).innerHTML = html;

    if(window.MathJax){
        MathJax.typesetPromise();
    }
}

function getTypeInfo(type, label){
    if(type === "single"){
        return {
            shortLabel: "SCQ",
            badgeClass: "type-scq",
            description: "Select the one correct option from the given choices."
        };
    }
    if(type === "multi"){
        return {
            shortLabel: "MCQ",
            badgeClass: "type-mcq",
            description: "Select all the correct options. Partial marks are awarded for partially correct selections."
        };
    }
    if(type === "numerical"){
        return {
            shortLabel: "NUM",
            badgeClass: "type-num",
            description: "Type the numerical answer in the input box."
        };
    }
    return null;
}

function continueToTest(){

    document.getElementById(
        "instructionsOverlay"
    ).style.display="none";

    document.getElementById(
        "quizContainer"
    ).style.display="flex";

    /* Reset button for potential re-show */
    document.getElementById(
        "continueBtn"
    ).textContent = "▶ Continue Test";

    document.getElementById(
        "continueBtn"
    ).onclick = continueToTest;

    updateTimerDisplay();

    startTimer();

    enterFullscreen();
}

function showInstructionsOverlay(){

    if(submitted)
        return;

    buildInstructionsContent();

    /* Switch to resume mode */
    document.getElementById(
        "continueBtn"
    ).textContent = "◀ Resume Test";

    document.getElementById(
        "continueBtn"
    ).onclick = hideInstructionsOverlay;

    document.getElementById(
        "instructionsOverlay"
    ).style.display="flex";
}

function hideInstructionsOverlay(){

    document.getElementById(
        "instructionsOverlay"
    ).style.display="none";

    /* Reset button */
    document.getElementById(
        "continueBtn"
    ).textContent = "▶ Continue Test";

    document.getElementById(
        "continueBtn"
    ).onclick = continueToTest;
}

/* ========================================= */
/* CUSTOM MODAL (does not trigger fullscreen exit) */
/* ========================================= */

function showModal(message, isConfirm = false) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box';
        
        const box = document.createElement('div');
        box.className = 'custom-modal';
        box.style.cssText = 'background:white;border-radius:14px;padding:28px 32px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);animation:modalFadeIn 0.25s ease-out;text-align:center';
        
        const msgEl = document.createElement('p');
        msgEl.className = 'custom-modal-message';
        msgEl.style.cssText = 'margin:0 0 22px 0;font-size:16px;color:#333;line-height:1.6;font-family:Arial,sans-serif';
        msgEl.textContent = message;
        
        const btnWrap = document.createElement('div');
        btnWrap.className = 'custom-modal-buttons';
        btnWrap.style.cssText = 'display:flex;gap:10px;justify-content:center';
        
        if(isConfirm) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'custom-modal-cancel-btn';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'padding:10px 24px;border-radius:8px;border:2px solid #ccc;background:#f5f5f5;color:#555;font-size:14px;font-weight:bold;cursor:pointer;transition:0.15s;font-family:Arial,sans-serif';
            cancelBtn.onmouseover = function(){ this.style.borderColor = '#999'; };
            cancelBtn.onmouseout = function(){ this.style.borderColor = '#ccc'; };
            cancelBtn.onclick = function() {
                document.body.removeChild(overlay);
                resolve(false);
            };
            btnWrap.appendChild(cancelBtn);
        }
        
        const okBtn = document.createElement('button');
        okBtn.className = 'custom-modal-ok-btn';
        okBtn.textContent = isConfirm ? 'Submit' : 'OK';
        okBtn.style.cssText = 'padding:10px 24px;border-radius:8px;border:2px solid transparent;background:#1976d2;color:white;font-size:14px;font-weight:bold;cursor:pointer;transition:0.15s;font-family:Arial,sans-serif';
        okBtn.onmouseover = function(){ this.style.borderColor = 'white'; };
        okBtn.onmouseout = function(){ this.style.borderColor = 'transparent'; };
        okBtn.onclick = function() {
            document.body.removeChild(overlay);
            resolve(true);
        };
        btnWrap.appendChild(okBtn);
        
        box.appendChild(msgEl);
        box.appendChild(btnWrap);
        overlay.appendChild(box);
        
        // Handle dark mode
        if(document.body.classList.contains('darkMode')) {
            box.style.background = '#2a2a2a';
            msgEl.style.color = '#e0e0e0';
            const cancel = box.querySelector('.custom-modal-cancel-btn');
            if(cancel) {
                cancel.style.background = '#3a3a3a';
                cancel.style.color = '#ccc';
                cancel.style.borderColor = '#555';
            }
        }
        
        document.body.appendChild(overlay);
        
        // Focus trap - focus the OK button
        setTimeout(function(){ okBtn.focus(); }, 50);
    });
}

/* full screen */

function enterFullscreen(){

    const elem = document.documentElement;

    if(elem.requestFullscreen){

        elem.requestFullscreen();
    }

    else if(elem.webkitRequestFullscreen){

        elem.webkitRequestFullscreen();
    }

    else if(elem.msRequestFullscreen){

        elem.msRequestFullscreen();
    }
}

function exitFullscreen(){
    if(document.exitFullscreen){
        document.exitFullscreen();
    }
    else if(document.webkitExitFullscreen){
        document.webkitExitFullscreen();
    }
    else if(document.msExitFullscreen){
        document.msExitFullscreen();
    }
}

/* ========================================= */
/* RENDER QUESTIONS */
/* ========================================= */

function renderQuestions(){

    let html = "";

    questions.forEach((q,index)=>{

        const sec = getQuestionSection(index);
        const sub = getQuestionSubsection(index);
        let headerHtml = '';
        if(sec) {
            headerHtml += `<div class="question-section-header">
                <span class="q-section-name">${escHtml(sec.name)}</span>`;
            if(sub) {
                headerHtml += ` <span class="q-section-sep">›</span> <span class="q-subsection-name">${escHtml(sub.label)}</span>`;
            }
            headerHtml += `</div>`;
        }

        html += `
        <div
        class="question ${index===0 ? 'active' : ''}"
        id="q${index}">

        <div class="question-scrollable">

        ${headerHtml}

        <h2>Q${index+1}</h2>

        <div class="question-text">

${
renderQuestionContent(
    q.question.replaceAll(
        "\\\(",
        "\\\(\\displaystyle "
    ),
    q.images || [],
    q.tables || []
)
}

</div>
        `;

        /* SINGLE */

        if(q.type==="single"){

            q.options.forEach((op,i)=>{

                const renderedOption = renderQuestionContent(op, q.images || [], q.tables || []);
                const letter = String.fromCharCode(65 + i);

                html += `
                <div class="option">

                <label>

                <input
                type="radio"
                name="q${index}"
                onchange="saveSingle(${index},${i})">

                <span class="option-letter">${letter}.</span> ${renderedOption}

                </label>

                </div>
                `;
            });
        }

        /* MULTI */

        else if(q.type==="multi"){

            q.options.forEach((op,i)=>{

                const renderedOption = renderQuestionContent(op, q.images || [], q.tables || []);
                const letter = String.fromCharCode(65 + i);

                html += `
                <div class="option">

                <label>

                <input
                type="checkbox"
                class="multi${index}"
                value="${i}"
                onchange="saveMulti(${index})">

                <span class="option-letter">${letter}.</span> ${renderedOption}

                </label>

                </div>
                `;
            });
        }

        /* NUMERICAL */

        else{

            html += `
            <input
            type="number"
            placeholder="Answer"
            value="${userAnswers[index] ?? ""}"
            oninput="saveNumerical(${index},this.value)">
            `;
        }

        html += `
            </div>

            <div class="question-btn-bar">

                <div class="btn-row btn-row-actions">
                    <button
                    class="clearRespBtn"
                    onclick="clearResponse(${index})">

                    Clear Response

                    </button>
                </div>

                <div class="btn-row btn-row-actions">
                    <button
                    class="reviewBtn"
                    onclick="markReview(${index})">

                    Mark For Review

                    </button>

                    <button
                    class="clearReviewBtn"
                    onclick="clearReview(${index})">

                    Clear Review

                    </button>
                </div>

                <div class="btn-row btn-row-nav">
                    <button
                    class="prevBtn"
                    onclick="prevQuestion()">

                    Previous

                    </button>

                    <button
                    class="nextBtn"
                    onclick="nextQuestion()">

                    Save & Next

                    </button>
                </div>

            </div>

        </div>`;
    });

    document.getElementById("questions").innerHTML = html;

    if(window.MathJax){

        MathJax.typesetPromise();
    }
}

/* ========================================= */
/* NAVIGATION */
/* ========================================= */

function renderNav(){

    let html = "";
    let globalIdx = 0;

    sections.forEach(section => {

        const subs = getSectionSubsections(section);
        const sectionQuestions = questions.filter(q => q.sectionId === section.id);
        if(sectionQuestions.length === 0) return;

        html += `<div class="sectionLabel clickable-section" onclick="onSectionClick(${section.id})" title="Click to view instructions for ${escHtml(section.name)}">
            <span class="section-arrow">▶</span>
            ${escHtml(section.name)}
        </div>`;

        subs.forEach(sub => {

            const subQs = sectionQuestions.filter(q => (q.subsection || q.type) === sub.id);
            if(subQs.length === 0) return;

            const firstQIdx = questions.indexOf(subQs[0]);
            html += `<div class="subsectionLabel clickable-subsection" onclick="onSubsectionClick(${section.id},'${sub.id}')" title="Click to view instructions for ${escHtml(sub.label)}">
                <span class="subsection-arrow">▸</span>
                ${escHtml(sub.label)}
            </div>`;
            html += `<div class="sectionNavGrid">`;

            subQs.forEach(q => {
                const idx = questions.indexOf(q);
                const isFirst = idx === firstQIdx;
                html += `
                <button
                class="navbtn${isFirst ? ' first-in-subsection' : ''}"
                id="nav${idx}"
                onclick="${isFirst ? `onSectionFirstQuestionClick(${idx})` : `gotoQuestion(${idx})`}"
                ${isFirst ? `title="Click to view section instructions"` : ''}>

                ${globalIdx+1}

                </button>
                `;
                globalIdx++;
            });

            html += `</div>`;
        });
    });

    document.getElementById("allNav").innerHTML = html;
}

function updateProgressBar(){

    let attempted = 0;

    userAnswers.forEach(ans=>{

        if(
            ans!==null &&
            ans!=="" &&
            !(Array.isArray(ans) &&
            ans.length===0)
        ){

            attempted++;
        }
    });

    const percent =

    (attempted/questions.length)*100;

    document.getElementById(
        "progressBar"
    ).style.width =

    percent + "%";

    document.getElementById(
        "progressText"
    ).innerHTML =

    `${attempted} / ${questions.length} Attempted`;
}

function updateNavColor(index){

    const btn =

    document.getElementById(
        "nav"+index
    );

    /* RESET */

    btn.className = "navbtn";

    /* REVIEW */

    if(markedForReview[index]){

        btn.classList.add(
            "yellow"
        );

        return;
    }

    const ans =
    userAnswers[index];

    const attempted =

    ans!==null &&
    ans!=="" &&
    !(Array.isArray(ans) &&
    ans.length===0);

    /* ATTEMPTED */

    if(attempted){

        btn.classList.add(
            "green"
        );
    }

    /* VISITED BUT NOT ANSWERED */

    else if(visited[index]){

        btn.classList.add(
            "red"
        );
    }

    /* NEVER VISITED - no extra color class */
}

function gotoQuestion(index, checkSubsection = true){
    if(submitted) return;

    // Check if we need to show subsection instructions on first visit
    if(checkSubsection) {
        const targetQ = questions[index];
        if(targetQ) {
            const subKey = targetQ.sectionId + '_' + (targetQ.subsection || targetQ.type);
            if(!subsectionInstructionsShown[subKey]) {
                const currentQ = questions[current];
                // Only show if navigating from a different section or subsection
                if(!currentQ || currentQ.sectionId !== targetQ.sectionId || (currentQ.subsection || currentQ.type) !== (targetQ.subsection || targetQ.type)) {
                    subsectionInstructionsShown[subKey] = true;
                    showSectionInstructions(targetQ.sectionId, targetQ.subsection || targetQ.type, function(){
                        gotoQuestion(index, false);
                    });
                    return;
                }
            }
        }
    }

    visited[index]=true;

    document.querySelectorAll(".question")
    .forEach(q=>q.classList.remove("active"));

    document.getElementById(`q${index}`)
    .classList.add("active");

    current=index;

    for(let i=0;i<questions.length;i++){

    updateNavColor(i);
}

    if(window.MathJax){

        MathJax.typesetPromise();
    }
}

function    gotoSection(sectionName){

    if(submitted)
        return;

    for(let i=0;i<questions.length;i++){

        const sec = sections.find(s => s.name === sectionName);
        if(sec && questions[i].sectionId === sec.id){
            gotoQuestion(i);
            break;
        }
    }
}

function onSectionClick(sectionId){
    if(submitted) return;
    const sec = getSectionById(sectionId);
    if(!sec) return;

    // Show section overview (condensed) without marking any subsection as shown
    showSectionInstructions(sectionId, null, function(){
        // Navigate to first question of this section
        for(let i = 0; i < questions.length; i++){
            if(questions[i].sectionId === sectionId){
                gotoQuestion(i, false);
                break;
            }
        }
    });
}

function onSubsectionClick(sectionId, subId){
    if(submitted) return;

    // Mark this subsection as shown and show subsection-specific instructions
    const subKey = sectionId + '_' + subId;
    subsectionInstructionsShown[subKey] = true;

    showSectionInstructions(sectionId, subId, function(){
        // Navigate to first question of this subsection
        for(let i = 0; i < questions.length; i++){
            const q = questions[i];
            if(q.sectionId === sectionId && (q.subsection || q.type) === subId){
                gotoQuestion(i, false);
                break;
            }
        }
    });
}

function onSectionFirstQuestionClick(index){
    if(submitted) return;
    const q = questions[index];
    if(!q) return;

    // Build the subsection key
    const subKey = q.sectionId + '_' + (q.subsection || q.type);

    // If instructions already shown for this subsection, go directly
    if(subsectionInstructionsShown[subKey]){
        gotoQuestion(index);
        return;
    }

    // First visit — show subsection-specific instructions and mark as shown
    subsectionInstructionsShown[subKey] = true;
    showSectionInstructions(q.sectionId, q.subsection || q.type, function(){
        gotoQuestion(index, false);
    });
}

async function nextQuestion(){

    if(submitted)
        return;

    if(current<questions.length-1){

        gotoQuestion(current+1);
    } else if(current === questions.length - 1) {
        await showModal("This is the last question of test");
    }
}

function prevQuestion(){

    if(submitted)
        return;

    if(current>0){

        gotoQuestion(current-1);
    }
}

/* ========================================= */
/* SAVE ANSWERS */
/* ========================================= */

function saveSingle(index,val){

    if(submitted)
        return;

    userAnswers[index]=val;

    updateNavColor(index);

    updateProgressBar();
}

function saveMulti(index){

    if(submitted)
        return;

    let arr=[];

    document.querySelectorAll(`.multi${index}`)
    .forEach((x,i)=>{

        if(x.checked)
            arr.push(i);
    });

    userAnswers[index]=arr;

    updateNavColor(index);

    updateProgressBar();
    
}

function saveNumerical(index,val){

    if(submitted)
        return;

    userAnswers[index]=val;

    updateNavColor(index);

    updateProgressBar();
}

document.addEventListener(

    "contextmenu",

    e => e.preventDefault()
);

document.addEventListener(

    "keydown",

    function(e){

        if(

            (e.ctrlKey &&
            (e.key==="c" ||
             e.key==="u" ||
             e.key==="s"))

            ||

            e.key==="F12"
        ){

            e.preventDefault();
        }
    }
);

document.addEventListener(

    "selectstart",

    function(e){

        if(

            e.target.tagName !== "INPUT" &&

            e.target.tagName !== "TEXTAREA"
        ){

            e.preventDefault();
        }
    }
);



/* ========================================= */
/* CLEAR */
/* ========================================= */

function clearSingle(index){

    if(submitted)
        return;

    document
    .querySelectorAll(`input[name="q${index}"]`)
    .forEach(x=>x.checked=false);

    userAnswers[index]=null;

    updateNavColor(index);
    updateProgressBar();
}

function clearMulti(index){

    if(submitted)
        return;

    document
    .querySelectorAll(`.multi${index}`)
    .forEach(x=>x.checked=false);

    userAnswers[index]=[];

    updateNavColor(index);
    updateProgressBar();
}

function markReview(index){

    markedForReview[index]=true;

    updateNavColor(index);
}

function clearReview(index){

    markedForReview[index]=false;

    updateNavColor(index);
}

function clearResponse(index){

    if(submitted)
        return;

    const q = questions[index];

    if(!q) return;

    if(q.type==="single"){

        clearSingle(index);
    }

    else if(q.type==="multi"){

        clearMulti(index);
    }

    else if(q.type==="numerical"){

        const input = document.querySelector(`#q${index} input[type="number"]`);

        if(input) input.value="";

        userAnswers[index]=null;

        updateNavColor(index);

        updateProgressBar();
    }
}

/* ========================================= */
/* HELPERS */
/* ========================================= */

function arraysEqual(a,b){

    if(a.length!==b.length)
        return false;

    a=[...a].sort();

    b=[...b].sort();

    for(let i=0;i<a.length;i++)
        if(a[i]!==b[i])
            return false;

    return true;
}

/* ========================================= */
/* GRADING */
/* ========================================= */

function gradeQuestion(q, user){

    if(
        user===null ||
        user==="" ||
        (Array.isArray(user) && user.length===0)
    )
        return 0;

    const totalMarks = getQuestionTotalMarks(q);
    const negativeMarks = getQuestionNegativeMarks(q);

    /* SINGLE */

    if(q.type==="single"){

        return user===q.answer ? totalMarks : -negativeMarks;
    }

    /* MULTI */

    if(q.type==="multi"){

        for(let x of user){

            if(!q.answer.includes(x))
                return -negativeMarks;
        }

        if(arraysEqual(user,q.answer))
            return totalMarks;

        let correctChosen = user.length;

        let totalCorrect = q.answer.length;

        return (totalMarks * correctChosen) / totalCorrect;
    }

    /* NUMERICAL */

    if(q.type==="numerical"){

        return Number(user)===q.answer
        ? totalMarks
        : -negativeMarks;
    }

    return 0;
}

/* ========================================= */
/* SUBMIT */
/* ========================================= */

async function submitTest(autoSubmitted = false){

    if(submitted)
        return;

    if(!autoSubmitted){
        const confirmSubmit = await showModal(

        "Are you sure you want to submit the test?",
        true

        );

        if(!confirmSubmit)
            return;
    }

    localStorage.removeItem(
    "progress_" + currentEmail
);

    clearInterval(timerInterval);
    timerInterval = null;

    let total = 0;

    let attempted = 0;

    let reviewHTML = "";

    /* For section/subsection breakdown */
    let sectionMarks = {};
    let subsectionMarks = {};

    sections.forEach(sec => {
        sectionMarks[sec.id] = {name: sec.name, total: 0, max: 0};
        const subs = getSectionSubsections(sec);
        subs.forEach(sub => {
            const key = sec.id + "_" + sub.id;
            subsectionMarks[key] = {sectionId: sec.id, sectionName: sec.name, subId: sub.id, subLabel: sub.label, total: 0, max: 0};
        });
    });

    questions.forEach((q,i)=>{

        const user = userAnswers[i];

        const marks = gradeQuestion(q,user);

        total += marks;

        const qTotalMarks = getQuestionTotalMarks(q);

        /* Section-wise */
        if(sectionMarks[q.sectionId]){
            sectionMarks[q.sectionId].total += marks;
            sectionMarks[q.sectionId].max += qTotalMarks;
        }

        /* Subsection-wise */
        const subKey = q.sectionId + "_" + (q.subsection || q.type);
        if(subsectionMarks[subKey]){
            subsectionMarks[subKey].total += marks;
            subsectionMarks[subKey].max += qTotalMarks;
        }
        const subLabel = subsectionMarks[subKey] ? subsectionMarks[subKey].subLabel : '';
        const secName = sectionMarks[q.sectionId] ? sectionMarks[q.sectionId].name : '';


        /* ATTEMPTED */

        if(
            user!==null &&
            user!=="" &&
            !(Array.isArray(user) &&
            user.length===0)
        ){
            attempted++;
        }

        /* STATUS */

        let status = "";

        if(
            user===null ||
            user==="" ||
            (Array.isArray(user) &&
            user.length===0)
        ){

            status = "UNATTEMPTED";
        }

        else if(marks>0){

            if(marks >= getQuestionTotalMarks(q))
                status = "CORRECT";

            else
                status = "PARTIALLY CORRECT";
        }

        else{

            status = "WRONG";
        }

        /* USER ANSWER */

        let userText = "";

        if(q.type==="single"){

            if(user===null){

                userText="Not Answered";
            }

            else{

                userText = String.fromCharCode(65 + user);
            }
        }

        else if(q.type==="multi"){

            if(!user || user.length===0){

                userText="Not Answered";
            }

            else{

                userText = user
                .map(x => String.fromCharCode(65 + x))
                .join(", ");
            }
        }

        else{

            userText =
            user===null || user===""
            ? "Not Answered"
            : `\\( \\displaystyle ${user} \\)`;
        }

        /* CORRECT ANSWER */

        let correctText = "";

        if(q.type==="single"){

            correctText = String.fromCharCode(65 + q.answer);
        }

        else if(q.type==="multi"){

            correctText = q.answer
            .map(x => String.fromCharCode(65 + x))
            .join(", ");
        }

        else{

            correctText = `\\( ${q.answer} \\)`;
        }

        /* OPTIONS HTML for PDF */

        let optsHtml = '';
        if (q.options && q.options.length > 0) {
          optsHtml = '<div class="review-options">';
          q.options.forEach((op, oi) => {
            const renderedOp = renderQuestionContent(op, q.images || [], q.tables || []);
            optsHtml += '<div class="review-option">' + String.fromCharCode(65 + oi) + '. ' + renderedOp + '</div>';
          });
          optsHtml += '</div>';
        }

        /* REVIEW BLOCK */

        reviewHTML += `

        <div class="review">

        <h3>
        Q${i+1}
        </h3>

        ${secName ? '<div class="review-section-info">Section: ' + secName + '</div>' : ''}
        ${subLabel ? '<div class="review-subsection-info">Subsection: ' + subLabel + '</div>' : ''}

        <div class="review-question-text">

${
renderQuestionContent(
    q.question,
    q.images || [],
    q.tables || []
)
}

</div>

        ${optsHtml}

        <div class="review-details">

        <p>
        <b>Status:</b>
        ${status}
        </p>

        <p>
        <b>Your Answer:</b>
        ${userText}
        </p>

        <p>
        <b>Correct Answer:</b>
        ${correctText}
        </p>

        <p>
        <b>Marks:</b>
        ${marks.toFixed(3)}
        </p>

        </div>

        </div>
        `;
    });

    /* DISABLE */

    document
    .querySelectorAll("input, button")
    .forEach(el=>{

        el.disabled = true;
    });

    /* TOTAL */

    let maxMarks = 0;
    questions.forEach(q => {
        maxMarks += getQuestionTotalMarks(q);
    });

    let percentage =
    ((total/maxMarks)*100).toFixed(2);

    const timeTaken =

examDuration - totalSeconds;

const hours =
Math.floor(timeTaken/3600);

const minutes =
Math.floor((timeTaken%3600)/60);

const seconds =
timeTaken%60;

const timeTakenText =

hours + " hr " +

minutes + " min " +

seconds + " sec";

    /* Build section/subsection marks HTML */
    let breakdownHTML = '';
    sections.forEach(sec => {
        const sm = sectionMarks[sec.id];
        if(!sm) return;
        const secPct = sm.max > 0 ? ((sm.total / sm.max) * 100).toFixed(2) : "0.00";
        breakdownHTML += `<div class="sec-breakdown">
            <div class="sec-breakdown-header">
                <span class="sec-name">${sec.name}</span>
                <span class="sec-score">${sm.total.toFixed(3)} / ${sm.max} (${secPct}%)</span>
            </div>`;
        const subs = getSectionSubsections(sec);
        subs.forEach(sub => {
            const sk = sec.id + "_" + sub.id;
            const sbm = subsectionMarks[sk];
            if(!sbm || sbm.max === 0) return;
            const subPct = ((sbm.total / sbm.max) * 100).toFixed(2);
            breakdownHTML += `<div class="subsec-breakdown">
                <span class="subsec-name">${sub.label}</span>
                <span class="subsec-score">${sbm.total.toFixed(3)} / ${sbm.max} (${subPct}%)</span>
            </div>`;
        });
        breakdownHTML += `</div>`;
    });

    /* SAVE RESULT */

    const resultData = {

    email:currentEmail,

    score:total,

    timeTaken:timeTakenText,

    percentage:percentage,

    attempted:attempted,

    totalQuestions:questions.length,

    maxMarks:maxMarks,
    answers:userAnswers,
    sectionMarks:sectionMarks,
    subsectionMarks:subsectionMarks,
    sectionsData:sections,
    reviewHTML:reviewHTML,
    breakdownHTML:breakdownHTML,
    questions:questions
};

    localStorage.setItem(

        "quiz_" + currentEmail,

        JSON.stringify(resultData)
    );
    fetch("/save-result",{

    method:"POST",

    headers:{
        "Content-Type":
        "application/json"
    },

    body:JSON.stringify({

        email:currentEmail,

        score:total,

        percentage:percentage,

        timeTaken:timeTakenText
    })
});

    /* Exit fullscreen so the result page is not in fullscreen */
    exitFullscreen();

    /* RESULT PAGE */

    openResultPage(

        "Test Submitted",

        currentEmail,

        questions.length,

        attempted,

        total,

        maxMarks,

        percentage,

        timeTakenText,

        reviewHTML,
        breakdownHTML,
        questions,
        sections
    );
}
/* ========================================= */
/* SHOW OLD RESULT */
/* ========================================= */

/* ========================================= */
/* RESULT PAGE */
/* ========================================= */

function openResultPage(
    title,email,totalQ,attempted,
    score,maxMarks,percentage,timeTaken,reviewHTML,
    breakdownHTML,questionsData,
    sectionsData
){

    if(!breakdownHTML) breakdownHTML = "";
    if(!questionsData) questionsData = [];
    if(!sectionsData) sectionsData = [];

    const isDark = localStorage.getItem("theme") === "dark";

    const themeIcon = isDark ? "☀️" : "🌙";

    /* BUILD RESULT PAGE INLINE — no document.write, no Blob URL, no embedded <script> tags */
    
    try {
      document.title = title;

      // --- CSS ---
      var oldStyle = document.getElementById('resultInlineStyle');
      if (oldStyle) oldStyle.remove();

      var resultCSS = (
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:Arial,sans-serif;background:#f0f2f5;padding:20px;transition:background 0.3s,color 0.3s}' +
        '.resultDark body,.resultDark{background:#121212 !important;color:#e0e0e0 !important}' +
        '#resultHeader{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}' +
        '#resultHeaderLeft{display:flex;flex-direction:column;gap:6px}' +
        '#resultHeader h1{margin:0;font-size:24px}' +
        '#resultEmailBadge{font-size:14px;color:#555;background:#e8eaf6;padding:6px 14px;border-radius:20px;display:inline-block}' +
        '.resultDark #resultEmailBadge{color:#ccc;background:#2a2a2a}' +
        '#resultThemeBtn{background:#333;color:white;border:2px solid transparent;border-radius:50%;width:44px;height:44px;font-size:20px;cursor:pointer;transition:0.2s;display:flex;align-items:center;justify-content:center}' +
        '#resultThemeBtn:hover{border-color:white}' +
        '#resultHeaderRight{display:flex;align-items:center;gap:10px}' +
        '.resultDark #resultThemeBtn{background:#555}' +
        '.scoreBox{background:white;padding:24px;border-radius:12px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08);transition:background 0.3s}' +
        '.resultDark .scoreBox{background:#1e1e1e !important;box-shadow:0 2px 8px rgba(0,0,0,0.3)}' +
        '.scoreGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-top:16px}' +
        '.scoreItem{text-align:center;padding:14px 10px;border-radius:10px;background:#f8f9fa;transition:background 0.3s}' +
        '.resultDark .scoreItem{background:#2a2a2a !important}' +
        '.scoreItem .label{font-size:13px;color:#666;margin-bottom:4px}' +
        '.resultDark .scoreItem .label{color:#aaa}' +
        '.scoreItem .value{font-size:22px;font-weight:bold;color:#222}' +
        '.resultDark .scoreItem .value{color:#fff}' +
        '.scoreItem .value.greenText{color:#2e7d32}' +
        '.scoreItem .value.orangeText{color:#e65100}' +
        '.scoreItem .value.blueText{color:#1565c0}' +
        '.scoreItem .value.purpleText{color:#6a1b9a}' +
        '.review{border:1px solid #e0e0e0;padding:18px;margin-bottom:18px;border-radius:12px;background:white;line-height:1.8;transition:background 0.3s,border-color 0.3s}' +
        '.resultDark .review{background:#1e1e1e !important;border-color:#333 !important}' +
        '.review p{line-height:1.8}' +
        '.review h3{color:#1565c0;margin-bottom:8px}' +
        '.resultDark .review h3{color:#64b5f6}' +
        '#reviewHeading{font-size:20px;margin-bottom:16px;margin-top:8px}' +
        '.review img{max-width:100%;border-radius:4px;margin:4px 0}' +
        '.review .question-table-wrap{margin:8px 0;overflow-x:auto}' +
        '.review .question-table-wrap table{border-collapse:collapse;width:auto;min-width:200px}' +
        '.review .question-table-wrap td,.review .question-table-wrap th{border:1px solid #bbb;padding:6px 10px;font-size:12px;text-align:center}' +
        '.review .question-table-wrap th{background:#e3f2fd;font-weight:bold}' +
        '.review .review-options{padding-left:8px;margin:8px 0 6px 0}' +
        '.review .review-option{font-size:13px;color:#444;padding:2px 0;line-height:1.6}' +
        '.review .review-option.correctOption{color:#2e7d32;font-weight:bold}' +
        '.correct-badge{display:inline-block;background:#2e7d32;color:#fff;font-size:10px;font-weight:bold;padding:1px 8px;border-radius:10px;margin-left:6px;vertical-align:middle}' +
        '.review-section-info{font-size:13px;color:#1565c0;font-weight:bold;margin:2px 0 1px 0;padding:0;line-height:1.5}' +
        '.review-subsection-info{font-size:12.5px;color:#555;margin:0 0 4px 0;padding:0;line-height:1.5}' +
        '.resultDark .review-section-info{color:#64b5f6}' +
        '.resultDark .review-subsection-info{color:#aaa}' +
        '.resultDark .review .review-option{color:#ccc !important}' +
        '.resultDark .review .review-option.correctOption{color:#66bb6a !important}' +
        '.resultDark .review-question-text{color:#e0e0e0 !important}' +
        '.resultDark .review-details{color:#ccc !important}' +
        '.resultDark .review-details b{color:#ddd !important}' +
        '.question img.question-image{max-width:100%;border-radius:6px;margin:6px 0;display:inline-block;vertical-align:middle}' +
        '.question .question-table-wrap table{border-collapse:collapse;width:auto;min-width:200px;margin:10px 0}' +
        '.question .question-table-wrap td,.question .question-table-wrap th{border:1px solid #bbb;padding:8px 12px;text-align:center;font-size:13px}' +
        '.question .question-table-wrap th{background:#e3f2fd;font-weight:bold}' +
        '.question .question-table-wrap caption{font-size:12px;color:#666;font-style:italic;margin-bottom:4px}' +
        '.question .question-text{line-height:1.8}' +
        '.resultDark .question-table-wrap td,.resultDark .question-table-wrap th{border-color:#555}' +
        '.resultDark .question-table-wrap th{background:#1a237e !important;color:#e0e0e0}' +
        '.resultDark .question-table-wrap td{background:#1e1e1e;color:#e0e0e0}' +
        '.resultDark .review .question-table-wrap td,.resultDark .review .question-table-wrap th{border-color:#555}' +
        '.resultDark .review .question-table-wrap th{background:#1a237e;color:#e0e0e0}' +
        '.sec-breakdown{border:1px solid #e0e0e0;border-radius:10px;padding:14px 18px;margin-bottom:12px;background:#fafafa;transition:background 0.3s,border-color 0.3s}' +
        '.resultDark .sec-breakdown{background:#252525 !important;border-color:#444 !important}' +
        '.sec-breakdown-header{display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:15px;margin-bottom:8px}' +
        '.sec-name{color:#1976d2}' +
        '.resultDark .sec-name{color:#64b5f6}' +
        '.sec-score{color:#333}' +
        '.resultDark .sec-score{color:#ccc}' +
        '.subsec-breakdown{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;margin:4px 0 4px 20px;background:white;border-radius:6px;font-size:13px;border:1px solid #eee;transition:background 0.3s,border-color 0.3s}' +
        '.resultDark .subsec-breakdown{background:#1e1e1e !important;border-color:#3a3a3a !important}' +
        '.subsec-name{color:#555;font-weight:normal}' +
        '.resultDark .subsec-name{color:#bbb}' +
        '.subsec-score{font-weight:bold;color:#2e7d32}' +
        '.resultDark .subsec-score{color:#66bb6a}' +
        '@media print{' +
          'body{background:white !important;padding:15px !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
          '.resultDark body,.resultDark{background:white !important;color:#222 !important}' +
          '#resultHeaderRight{display:none !important}' +
          '#reviewHeading{margin-top:0;margin-bottom:10px;page-break-before:always}' +
          '.scoreBox{box-shadow:none !important;break-inside:avoid;background:#f8f9fa !important;border:1px solid #ddd}' +
          '.resultDark .scoreBox{background:#f8f9fa !important;border-color:#ddd !important}' +
          '.resultDark .scoreItem{background:#f0f0f0 !important}' +
          '.scoreItem .label{color:#555 !important}' +
          '.scoreItem .value{color:#222 !important}' +
          '.resultDark .review{background:white !important;border-color:#ddd !important}' +
          '.resultDark .review h3{color:#1565c0 !important}' +
          '.review{break-inside:avoid;border:1px solid #ddd;box-shadow:none !important;padding:12px 14px}' +
          '.review .review-option.correctOption{color:#2e7d32 !important}' +
          '.resultDark .review .review-option.correctOption{color:#2e7d32 !important}' +
          '.resultDark .review-options .review-option{color:#444 !important}' +
          '.resultDark .question-table-wrap td,.resultDark .question-table-wrap th{border-color:#bbb !important;background:white !important;color:#222 !important}' +
          '.resultDark .question-table-wrap th{background:#e3f2fd !important;color:#222 !important}' +
          '.sec-breakdown{break-inside:avoid;border:1px solid #ddd;background:#fafafa !important}' +
          '.resultDark .sec-breakdown{background:#fafafa !important;border-color:#ddd !important}' +
          '.resultDark .subsec-breakdown{background:white !important;border-color:#eee !important}' +
          '.resultDark .subsec-name{color:#555 !important}' +
          '.resultDark .sec-name{color:#1976d2 !important}' +
          '.resultDark .sec-score{color:#333 !important}' +
          '.resultDark .subsec-score{color:#2e7d32 !important}' +
          '.review-section-info{color:#1565c0 !important}' +
          '.review-subsection-info{color:#555 !important}' +
          '.resultDark .review-section-info{color:#1565c0 !important}' +
          '.resultDark .review-subsection-info{color:#555 !important}' +
          '#resultEmailBadge{border:1px solid #ccc;color:#555 !important;background:#e8eaf6 !important}' +
          '.resultDark #resultEmailBadge{color:#555 !important;background:#e8eaf6 !important}' +
          'h2#reviewHeading{color:#222 !important}' +
          '.resultDark h2#reviewHeading{color:#222 !important}' +
          '#resultHeaderLeft h1{color:#222 !important}' +
          '.resultDark #resultHeaderLeft h1{color:#222 !important}' +
          '.scoreItem .value.greenText{color:#2e7d32 !important}' +
          '.scoreItem .value.blueText{color:#1565c0 !important}' +
          '.scoreItem .value.orangeText{color:#e65100 !important}' +
          '.scoreItem .value.purpleText{color:#6a1b9a !important}' +
          'img{max-width:100% !important}' +
          '.review img{border:1px solid #eee}' +
          '.review-question-text{line-height:1.7}' +
          '.review-options{border-left:3px solid #1976d2;padding:6px 8px 6px 14px;margin:6px 0 8px 0;background:#f8f9fa !important}' +
          '.resultDark .review-options{background:#f0f0f0 !important}' +
          '.review-option{font-size:12.5px !important;padding:4px 0 !important;letter-spacing:0.2px;line-height:1.6 !important;color:#333 !important}' +
          '.review-option.correctOption{color:#2e7d32 !important;font-weight:bold !important}' +
          '.review-option::before{content:\"\";margin-right:0}' +
          '.review-details{display:block !important}' +
          '.review > p{display:block !important}' +
          '.correct-badge{display:inline-block;background:#2e7d32;color:#fff !important;font-size:10px;font-weight:bold;padding:1px 8px;border-radius:10px;margin-left:6px;vertical-align:middle}' +
          '#breakdownArea,.sec-breakdown{margin-bottom:8px}' +
          '@page{margin:15mm 12mm}' +
        '}'
      );

      var styleEl = document.createElement('style');
      styleEl.id = 'resultInlineStyle';
      styleEl.textContent = resultCSS;
      document.head.appendChild(styleEl);

      // --- MathJax config ---
      window.MathJax = window.MathJax || {};
      window.MathJax.tex = window.MathJax.tex || {};
      window.MathJax.tex.inlineMath = [['\\(','\\)']];

      // Load MathJax if not already loaded
      if (!document.getElementById('resultMathJaxScript')) {
        var mjScript = document.createElement('script');
        mjScript.id = 'resultMathJaxScript';
        mjScript.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
        mjScript.async = true;
        document.head.appendChild(mjScript);
      }

      // --- Theme toggle (global function for onclick attribute) ---
      window.toggleResultTheme = function(){
        var html = document.documentElement;
        html.classList.toggle('resultDark');
        var isDark = html.classList.contains('resultDark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        var btn = document.getElementById('resultThemeBtn');
        if (btn) btn.textContent = isDark ? '\u2600\uFE0F' : '\uD83C\uDF19';
      };

      // --- Set window data ---
      window.__questionsData = questionsData || [];
      window.__sectionsData = sectionsData || [];

      // --- Build body HTML (no <script> tags, purely structural) ---
      var bodyHTML = '';

      // Header
      bodyHTML += '<div id="resultHeader">';
      bodyHTML += '<div id="resultHeaderLeft">';
      bodyHTML += '<h1>' + title + '</h1>';
      bodyHTML += '<div id="resultEmailBadge">' + email + '</div>';
      bodyHTML += '</div>';
      bodyHTML += '<div id="resultHeaderRight">';
      bodyHTML += '<button id="resultThemeBtn" onclick="toggleResultTheme()">' + themeIcon + '</button>';
      bodyHTML += '<button id="qpDownloadBtn" style="background:#1565c0;color:white;border:2px solid transparent;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:bold;cursor:pointer;transition:0.2s;white-space:nowrap" onmouseover="this.style.borderColor=\'white\'" onmouseout="this.style.borderColor=\'transparent\'" title="Download a clean question paper with sections & questions (no answers)">\uD83D\uDCC4 Download Question Paper</button>';
      bodyHTML += '<button id="pdfDownloadBtn" style="background:#2e7d32;color:white;border:2px solid transparent;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:bold;cursor:pointer;transition:0.2s;white-space:nowrap" onmouseover="this.style.borderColor=\'white\'" onmouseout="this.style.borderColor=\'transparent\'" title="View a printer-friendly version of your result">\uD83D\uDCC4 View Result in Printable Format</button>';
      bodyHTML += '</div>';
      bodyHTML += '</div>';

      // Score box
      bodyHTML += '<div class="scoreBox"><div class="scoreGrid">';
      bodyHTML += '<div class="scoreItem"><div class="label">Total Questions</div><div class="value blueText">' + totalQ + '</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Attempted</div><div class="value orangeText">' + attempted + '</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Score</div><div class="value greenText">' + Number(score).toFixed(3) + '/' + maxMarks + '</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Percentage</div><div class="value purpleText">' + percentage + '%</div></div>';
      bodyHTML += '<div class="scoreItem"><div class="label">Time Taken</div><div class="value blueText">' + timeTaken + '</div></div>';
      bodyHTML += '</div></div>';

      // Breakdown
      if (breakdownHTML) {
        bodyHTML += '<div class="scoreBox"><h2 style="font-size:18px;margin-bottom:12px">\uD83D\uDCCA Section-wise Marks</h2><div id="breakdownArea">' + breakdownHTML + '</div></div>';
      }

      // Review
      bodyHTML += '<h2 id="reviewHeading">Question Review</h2>';
      bodyHTML += '<div id="reviewArea">' + reviewHTML + '</div>';

      // Render body
      document.body.innerHTML = bodyHTML;

      // Remove test-page darkMode class so it doesn't interfere with result page's own theme
      document.body.classList.remove('darkMode');

      // Apply dark class if needed
      if (isDark) {
        document.documentElement.classList.add('resultDark');
      } else {
        document.documentElement.classList.remove('resultDark');
      }

      // --- Set up event listeners ---

      // Build review options HTML helper
      window.buildReviewOptionsHtml = function(q){
        var letters = ['A','B','C','D','E','F','G','H'];
        var h = '<div class="review-options">';
        if (q.options && q.options.length > 0) {
          for (var oi = 0; oi < q.options.length; oi++) {
            var op = q.options[oi];
            var renderedOp = (typeof renderQuestionContent === 'function')
              ? renderQuestionContent(op, q.images || [], q.tables || [])
              : op;
            var letter = oi < letters.length ? letters[oi] : ('Option ' + (oi+1));
            h += '<div class="review-option">' + letter + '. ' + renderedOp + '</div>';
          }
        }
        h += '</div>';
        return h;
      };

      // EscHtml helper
      window.escHtml = function(str){
        if(!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      };

      // Generate question paper HTML
      window.generateQuestionPaperHtml = function(qData, secData) {
        if (!qData || !Array.isArray(qData) || qData.length === 0) return '<p>No questions available.</p>';

        function getSecName(id) {
          if (!secData || !Array.isArray(secData)) return 'Section ' + id;
          var sec = secData.find(function(s){ return s.id === id; });
          return sec ? sec.name : 'Section ' + id;
        }

        function getTypeLabel(q) {
          var typeMap = {single:'Single Correct', multi:'Multiple Correct', numerical:'Numerical Answer'};
          return typeMap[q.type] || q.type || '';
        }

        var letters = ['A','B','C','D','E','F','G','H'];

        var sectionsMap = {};
        for (var qi = 0; qi < qData.length; qi++) {
          var q = qData[qi];
          var sid = q.sectionId || 0;
          if (!sectionsMap[sid]) sectionsMap[sid] = {name: getSecName(sid), questions: []};
          sectionsMap[sid].questions.push(q);
        }

        var sortedSecIds = [];
        if (secData && Array.isArray(secData)) {
          for (var si = 0; si < secData.length; si++) {
            if (sectionsMap[secData[si].id]) sortedSecIds.push(secData[si].id);
          }
          for (var key in sectionsMap) {
            var kid = parseInt(key);
            if (sortedSecIds.indexOf(kid) === -1) sortedSecIds.push(kid);
          }
        } else {
          sortedSecIds = Object.keys(sectionsMap).map(Number);
        }

        var globalQNum = 0;
        var h = '<div class="qp-container">';

        for (var si = 0; si < sortedSecIds.length; si++) {
          var sid = sortedSecIds[si];
          var sec = sectionsMap[sid];
          if (!sec) continue;

          h += '<div class="qp-section">';
          h += '<h2 class="qp-section-title">' + window.escHtml(sec.name) + '</h2>';

          var subMap = {};
          for (var qi = 0; qi < sec.questions.length; qi++) {
            var q = sec.questions[qi];
            var subKey = q.subsection || q.type || 'other';
            if (!subMap[subKey]) subMap[subKey] = [];
            subMap[subKey].push(q);
          }

          var subKeys = Object.keys(subMap);
          for (var ski = 0; ski < subKeys.length; ski++) {
            var subQs = subMap[subKeys[ski]];
            if (subQs.length === 0) continue;

            var typeLabel = getTypeLabel(subQs[0]);
            h += '<div class="qp-subsection">';
            h += '<h3 class="qp-subsection-title">' + window.escHtml(typeLabel) + '</h3>';

            for (var qi = 0; qi < subQs.length; qi++) {
              var q = subQs[qi];
              globalQNum++;

              h += '<div class="qp-question">';
              h += '<div class="qp-q-header"><strong>Q' + globalQNum + '.</strong></div>';
              var qText = (q.question || '');
              if (typeof renderQuestionContent === 'function') {
                qText = renderQuestionContent(q.question || '', q.images || [], q.tables || []);
              }
              h += '<div class="qp-q-text">' + qText + '</div>';

              if (q.options && q.options.length > 0) {
                h += '<div class="qp-options">';
                for (var oi = 0; oi < q.options.length; oi++) {
                  var letter = oi < letters.length ? letters[oi] : ('Option ' + (oi + 1));
                  var isCorrect = q.type === 'multi' ? q.answer.indexOf(oi) !== -1 : q.answer === oi;
                  var correctTag = isCorrect ? ' <span class="qpc-badge">\u2714 Correct</span>' : '';
                  h += '<div class="qp-option' + (isCorrect ? ' qp-option-correct' : '') + '">' + letter + '. ' + (q.options[oi] || '') + correctTag + '</div>';
                }
                h += '</div>';
              }

              if (q.type === 'numerical') {
                h += '<div class="qp-numerical-answer">Answer: ' + window.escHtml(String(q.answer)) + '</div>';
              }

              h += '</div>';
            }
            h += '</div>';
          }

          h += '</div>';
        }

        h += '</div>';
        return h;
      };

      // QP download button
      var qpBtn = document.getElementById('qpDownloadBtn');
      if (qpBtn) {
        qpBtn.addEventListener('click', function(){
          var btn = this;
          btn.disabled = true;
          btn.textContent = 'Preparing...';

          var qData = window.__questionsData || [];
          var secData = window.__sectionsData || [];
          var qpHTML = window.generateQuestionPaperHtml(qData, secData);

          var qpPage = window.open('', '_blank');
          if (!qpPage) {
            alert('Please allow pop-ups to download the question paper.');
            btn.disabled = false;
            btn.textContent = '\uD83D\uDCC4 Download Question Paper';
            return;
          }

          qpPage.document.write('<!DOCTYPE html><html><head><title>Question Paper</title>');
          qpPage.document.write('<style>*{box-sizing:border-box;margin:0;padding:0}');
          qpPage.document.write('body{font-family:Arial,sans-serif;padding:30px 40px;background:white;color:#222;line-height:1.7}');
          qpPage.document.write('h1.qp-main-title{font-size:24px;text-align:center;margin-bottom:6px;color:#222}');
          qpPage.document.write('.qp-subtitle{text-align:center;font-size:14px;color:#666;margin-bottom:24px}');
          qpPage.document.write('.qp-section{margin-bottom:28px}');
          qpPage.document.write('.qp-section + .qp-section{page-break-before:always}');
          qpPage.document.write('.qp-section-title{font-size:18px;color:#1565c0;border-bottom:2px solid #1565c0;padding-bottom:4px;margin-bottom:14px;page-break-after:avoid}');
          qpPage.document.write('.qp-subsection-title{font-size:14px;color:#555;margin:12px 0 8px 0;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;page-break-after:avoid}');
          qpPage.document.write('.qp-subsection{margin-bottom:14px}');
          qpPage.document.write('.qp-question{margin-bottom:18px;padding-left:4px;page-break-inside:avoid}');
          qpPage.document.write('.qp-q-header{font-size:14px;margin-bottom:4px;color:#333}');
          qpPage.document.write('.qp-q-text{font-size:14px;margin-bottom:8px;line-height:1.8}');
          qpPage.document.write('.qp-options{padding-left:20px;margin:4px 0}');
          qpPage.document.write('.qp-option{font-size:13.5px;padding:2px 0;color:#444;line-height:1.6}');
          qpPage.document.write('.qp-option-correct{font-weight:bold;color:#2e7d32}');
          qpPage.document.write('.qpc-badge{display:inline-block;background:#2e7d32;color:#fff;font-size:10px;font-weight:bold;padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle}');
          qpPage.document.write('.qp-numerical-answer{font-size:13.5px;color:#2e7d32;padding-left:20px;margin-top:4px;font-weight:bold}');
          qpPage.document.write('.qp-container img{max-width:100%;border-radius:4px;margin:4px 0}');
          qpPage.document.write('.qp-container table{border-collapse:collapse;margin:8px 0;width:auto;min-width:200px}');
          qpPage.document.write('.qp-container td,.qp-container th{border:1px solid #bbb;padding:6px 10px;font-size:12px;text-align:center}');
          qpPage.document.write('.qp-container th{background:#e3f2fd;font-weight:bold}');
          qpPage.document.write('.instruction-card{border:1px solid #ddd;border-radius:8px;padding:8px 14px;margin-bottom:8px;background:#fafafa}');
          qpPage.document.write('.instruction-card h2{margin:0 0 5px 0;font-size:14px;color:#333}');
          qpPage.document.write('.instruction-card p{margin:3px 0;font-size:12.5px;color:#555;line-height:1.5}');
          qpPage.document.write('.instruction-list{margin:2px 0 0 0;padding:0;list-style:none}');
          qpPage.document.write('.instruction-list li{padding:4px 0 4px 16px;position:relative;font-size:12.5px;color:#444;line-height:1.5;border-bottom:1px solid #eee}');
          qpPage.document.write('.instruction-list li:last-child{border-bottom:none}');
          qpPage.document.write('.instruction-list li::before{content:\"\";position:absolute;left:2px;top:7px;width:6px;height:6px;border-radius:50%;background:#4a90d9}');
          qpPage.document.write('.instruction-sub{font-size:11px;color:#888;display:block;margin-top:1px}');
          qpPage.document.write('.instruction-types li{padding-left:0}');
          qpPage.document.write('.instruction-types li::before{display:none}');
          qpPage.document.write('.type-badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:bold;margin-right:6px;vertical-align:middle}');
          qpPage.document.write('.type-scq{background:#e3f2fd;color:#1565c0}');
          qpPage.document.write('.type-mcq{background:#fce4ec;color:#c62828}');
          qpPage.document.write('.type-num{background:#e8f5e9;color:#2e7d32}');
          qpPage.document.write('.marking-table-wrap{overflow-x:auto;margin:4px 0}');
          qpPage.document.write('.marking-table{width:100%;border-collapse:collapse;font-size:12.5px}');
          qpPage.document.write('.marking-table th{background:#e3f2fd;padding:5px 10px;text-align:left;font-size:12px;font-weight:bold;color:#333;border:1px solid #d0d0d0}');
          qpPage.document.write('.marking-table td{padding:4px 10px;border:1px solid #d0d0d0;color:#444}');
          qpPage.document.write('.marks-positive{font-weight:bold;color:#2e7d32;text-align:center}');
          qpPage.document.write('.marks-negative{font-weight:bold;color:#d32f2f;text-align:center}');
          qpPage.document.write('.marks-neutral{font-weight:bold;color:#888;text-align:center}');
          qpPage.document.write('.marks-partial{font-weight:bold;color:#e65100;text-align:center;font-size:11px}');
          qpPage.document.write('.instruction-note{font-size:11.5px;color:#888;font-style:italic;margin-top:4px}');
          qpPage.document.write('.nav-dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle;border:1px solid rgba(0,0,0,0.12)}');
          qpPage.document.write('.green-dot{background:green}');
          qpPage.document.write('.red-dot{background:#ff4d4d}');
          qpPage.document.write('.yellow-dot{background:gold}');
          qpPage.document.write('.white-dot{background:white;border:1px solid #ccc}');
          qpPage.document.write('@media print{body{padding:20px 30px}}');
          qpPage.document.write('@page{margin:15mm 12mm}');
          qpPage.document.write('</style>');
          qpPage.document.write('<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\/script>');
          qpPage.document.write('</head><body>');
          qpPage.document.write('<h1 class="qp-main-title">Question Paper</h1>');
          var instrHtml = (typeof generateInstructionsHtml === 'function') ? generateInstructionsHtml(qData, secData, false) : '';
          if (instrHtml) {
            qpPage.document.write('<div class="qp-instructions" style="page-break-after:always;margin-bottom:12px">');
            qpPage.document.write('<h2 style="font-size:16px;margin-bottom:8px;color:#333">Instructions</h2>');
            qpPage.document.write(instrHtml);
            qpPage.document.write('</div>');
          }
          qpPage.document.write(qpHTML);
          qpPage.document.write('<\/body><\/html>');
          qpPage.document.close();

          setTimeout(function(){
            if (qpPage.MathJax && qpPage.MathJax.typesetPromise) {
              qpPage.MathJax.typesetPromise().then(function(){ qpPage.print(); }).catch(function(){ qpPage.print(); });
            } else {
              qpPage.print();
            }
            btn.disabled = false;
            btn.textContent = '\uD83D\uDCC4 Download Question Paper';
          }, 2000);
        });
      }

      // PDF download button
      var pdfBtn = document.getElementById('pdfDownloadBtn');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', function(){
          var btn = this;
          btn.disabled = true;
          btn.textContent = 'Preparing...';

          var qData = window.__questionsData;
          if (qData && Array.isArray(qData) && qData.length > 0) {
            var reviews = document.querySelectorAll('#reviewArea .review');
            for (var ri = 0; ri < reviews.length && ri < qData.length; ri++) {
              var review = reviews[ri];
              var q = qData[ri];
              var existingOpts = review.querySelector('.review-options');
              var newOptsHtml = window.buildReviewOptionsHtml(q);
              if (existingOpts) {
                existingOpts.outerHTML = newOptsHtml;
              } else {
                var details = review.querySelector('.review-details');
                var questionText = review.querySelector('.review-question-text');
                var insertAfter = questionText || review.querySelector('h3');
                if (insertAfter && newOptsHtml) {
                  var temp = document.createElement('div');
                  temp.innerHTML = newOptsHtml;
                  var firstChild = temp.firstChild;
                  if (firstChild) {
                    insertAfter.parentNode.insertBefore(firstChild, details || null);
                  }
                }
              }
            }
          }

          function doPrint(){
            window.print();
            setTimeout(function(){ btn.disabled = false; btn.textContent = '\uD83D\uDCC4 View Result in Printable Format'; }, 1000);
          }
          if (window.MathJax && window.MathJax.typesetPromise) {
            MathJax.typesetPromise().then(doPrint).catch(doPrint);
          } else {
            doPrint();
          }
        });
      }

      // MathJax typeset after delay
      setTimeout(function(){
        if (window.MathJax && window.MathJax.typesetPromise) {
          MathJax.typesetPromise().catch(function(){});
        }
      }, 1500);

    } catch(e) {
      console.error('Error rendering result page:', e);
      document.body.innerHTML = '<h1>Error rendering result</h1><pre>' + e.message + '</pre>';
    }
  }

function showPreviousResult(data){

    const maxMarks = data.maxMarks || (data.totalQuestions * 4);

    openResultPage(

        "Already Attempted",

        data.email,

        data.totalQuestions,

        data.attempted,

        data.score,

        maxMarks,

        data.percentage,

        data.timeTaken,

        data.reviewHTML || "",
        data.breakdownHTML || "",
        data.questions || [],
        data.sectionsData || []
    );
}

/* ========================================= */
/* TIMER */
/* ========================================= */

function updateTimerDisplay(){

    let h=Math.floor(totalSeconds/3600);

    let m=Math.floor((totalSeconds%3600)/60);

    let s=totalSeconds%60;

    document.getElementById("timer").innerHTML=

    `${String(h).padStart(2,'0')}:${
        String(m).padStart(2,'0')
    }:${
        String(s).padStart(2,'0')
    }`;
}

function startTimer(){

    /* PREVENT MULTIPLE TIMERS */

    if(timerInterval!==null)
        return;

    updateTimerDisplay();

    timerInterval = setInterval(()=>{

        if(submitted)
            return;

        totalSeconds--;

        updateTimerDisplay();

        saveProgress();

        if(totalSeconds<=0){

            clearInterval(timerInterval);

            timerInterval=null;

            submitTest(true);
        }

    },1000);
}

/* ========================================= */
/* START */
/* ========================================= */

/* document.addEventListener(

    "fullscreenchange",

    ()=>{

        if(submitted)
            return;

        if(!document.fullscreenElement){

            alert(
                "Fullscreen exited. Exam submitted."
            );

            submitTest();
        }
    }
); */

function restoreAnswers(){

    questions.forEach((q,index)=>{

        const ans =
        userAnswers[index];

        if(ans===null)
            return;

        /* SINGLE */

        if(q.type==="single"){

            const radios =
            document.querySelectorAll(
                `input[name="q${index}"]`
            );

            if(radios[ans]){

                radios[ans].checked=true;
            }
        }

        /* MULTI */

        else if(q.type==="multi"){

            ans.forEach(x=>{

                const checks =
                document.querySelectorAll(
                    `.multi${index}`
                );

                if(checks[x]){

                    checks[x].checked=true;
                }
            });
        }

        /* NUMERICAL */

        else{

            const input =
            document.querySelector(
                `#q${index} input`
            );

            if(input){

                input.value=ans;
            }
        }
    });
}

function initQuiz(){

    userAnswers = new Array(questions.length).fill(null);
    markedForReview = new Array(questions.length).fill(false);
    visited = new Array(questions.length).fill(false);
    visited[0] = true;
    subsectionInstructionsShown = {};

    renderQuestions();

    renderNav();

    for(let i=0;i<questions.length;i++){

        updateNavColor(i);
    }

    updateProgressBar();

    saveProgress();
}

function toggleTheme(){

    document.body.classList.toggle(
        "darkMode"
    );

    const dark =

    document.body.classList.contains(
        "darkMode"
    );

    localStorage.setItem(
        "theme",
        dark ? "dark" : "light"
    );

    updateThemeButtons();
}

function updateThemeButtons(){

    const dark =

    document.body.classList.contains(
        "darkMode"
    );

    const btns =

    document.querySelectorAll(
        "#themeBtn,#loginThemeBtn,#instructionsThemeBtn"
    );

    btns.forEach(btn=>{

        btn.innerHTML = dark ?

        "☀️"

        :

        "🌙";
    });
}

function applySavedTheme(){

    const savedTheme =

    localStorage.getItem(
        "theme"
    );

    if(savedTheme==="dark"){

        document.body.classList.add(
            "darkMode"
        );
    }

    else{

        document.body.classList.remove(
            "darkMode"
        );
    }

    updateThemeButtons();
}

window.onload = function(){

    applySavedTheme();

    loadQuestionsFromServer();
};