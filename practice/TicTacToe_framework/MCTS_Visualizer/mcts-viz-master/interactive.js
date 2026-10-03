function makeGameNode(model, value, visits, children) {
  return {
    "board": model,
    "value": value,
    "visits": visits,
    "children": children
  };
}

let initial_board = undefined;
let action_trace = [];
let best_move = null;

let currentActionIdx = -1;
let currentIterationIdx = -1;
let totalActionsTillNow = 0;

let final_tree = undefined;
let reconstructed_tree = undefined;
let draw_tree = undefined;

const VisualizationStates = Object.freeze({ 
    NONE: 0,
    VISUALIZING: 1,
    LAST_STEP: 2
});
let current_vis_state = 0;

function transitionToState(new_state) {
  current_vis_state = new_state;
  
  switch (new_state) {
    case VisualizationStates.NONE:
      currentActionIdx = 0;
      currentIterationIdx = 0;
      totalActionsTillNow = 0;
      updateInterface();
      sendDrawTree(null);

      document.getElementById("btn_next_iteration").disabled = true;
      document.getElementById("btn_next_action").disabled = true;
      document.getElementById("btn_last_step").disabled = true;
      document.getElementById("btn_make_play").disabled = true;
      break;
    case VisualizationStates.VISUALIZING:
      document.getElementById("btn_next_iteration").disabled = false;
      document.getElementById("btn_next_action").disabled = false;
      document.getElementById("btn_last_step").disabled = false;
      document.getElementById("btn_make_play").disabled = false;
      break;
    case VisualizationStates.LAST_STEP:
      document.getElementById("btn_next_iteration").disabled = true;
      document.getElementById("btn_next_action").disabled = true;
      document.getElementById("btn_last_step").disabled = true;
      document.getElementById("btn_make_play").disabled = false;
      break;
  }
}

function setupInteractive() {
  document.getElementById("btn_next_action").addEventListener("click", clickNextAction);
  document.getElementById("btn_next_iteration").addEventListener("click", clickNextIteration);
  document.getElementById("btn_last_step").addEventListener("click", clickVisualizeLastStep);
  document.getElementById("btn_make_play").addEventListener("click", clickMakePlay);
  transitionToState(VisualizationStates.NONE);
}

function setMCTS(mcts_obj, trace, searchTimeMs=0) {
  initial_board = mcts_obj.model.copy();
  action_trace = trace.trace;
  best_move = trace.move;

  final_tree = mcts_obj.tree.copy();
  reconstructed_tree = new Tree(new Node(new GameNode(null)));
  draw_tree = makeDrawTree(reconstructed_tree);

  tree_vis_p5.initial_board = initial_board;

  // Ghi nhận thông tin tìm kiếm MCTS vào module Diagnostics
  if (typeof recordMCTSSearch === "function") {
    let rollouts = action_trace.length > 0 ? (action_trace.length - 1) : 0;
    let playerMark = (best_move && best_move.player === PLAYER.HUMAN) ? "h" : "m";
    recordMCTSSearch(searchTimeMs, rollouts, final_tree.nodes.length, playerMark);
  }

  let action = action_trace[0][0];
  applyAction(action);

  transitionToState(VisualizationStates.VISUALIZING);
  draw_tree = makeDrawTree(reconstructed_tree);
  sendDrawTree(draw_tree);

  tree_vis_p5.focusNode(tree_vis_p5.tree.getRoot());
}

function sendDrawTree(tree) {
  updateInterface();
  tree_vis_p5.updateTree(tree);
}

function updateInterface() {
  let action_kind = "---";
  let action_progress_bar = "(-/-)";
  let iteration_progress_bar = "(-/-)";

  if (current_vis_state != VisualizationStates.NONE && action_trace.length > 0) {
    let currentAction = action_trace[currentIterationIdx][currentActionIdx];
    action_kind = currentAction.kind;
    action_progress_bar = "(" + totalActionsTillNow + "/" + (action_trace.flat().length - 1) + ")";
    iteration_progress_bar = "(" + currentIterationIdx + "/" + (action_trace.length - 1) + ")";
    
    updateLiveSidebar(currentAction);
  } else {
    resetLiveSidebar();
  }

  document.getElementById("current_action_kind").innerHTML = action_kind;
  document.getElementById("current_action_kind").className = "badge " + action_kind;
  document.getElementById("current_action_count").innerHTML = action_progress_bar;
  document.getElementById("current_iteration_count").innerHTML = iteration_progress_bar;
}

function getDisplayPos(pos) {
  if (pos === null || pos === undefined || pos === "?") return "?";
  let num = Number(pos);
  return isNaN(num) ? "?" : (num + 1);
}

function highlightAlgoLine(activeLineNum, actionKind) {
  for (let i = 1; i <= 7; i++) {
    let lineEl = document.getElementById("algo_line_" + i);
    if (lineEl) {
      lineEl.className = "algo-line";
      if (i === activeLineNum && actionKind) {
        lineEl.classList.add("active-" + actionKind);
      }
    }
  }
}

function resetLiveSidebar() {
  highlightAlgoLine(0, null);
  let badge = document.getElementById("sb_phase_badge");
  let desc = document.getElementById("sb_phase_desc");
  let formula = document.getElementById("sb_formula_sub");
  let candidates = document.getElementById("sb_candidates_area");

  if (badge) {
    badge.className = "badge";
    badge.innerText = "Chờ";
  }
  if (desc) {
    desc.innerText = "Nhấn 'Chạy thuật toán MCTS' để bắt đầu mô phỏng từng bước.";
  }
  if (formula) {
    formula.innerHTML = "UCB1 = --";
  }
  if (candidates) {
    candidates.innerHTML = "Chưa có dữ liệu nhánh con.";
  }
}

function updateLiveSidebar(action) {
  let badge = document.getElementById("sb_phase_badge");
  let desc = document.getElementById("sb_phase_desc");
  let formula = document.getElementById("sb_formula_sub");
  let candidates = document.getElementById("sb_candidates_area");

  if (!badge || !desc || !formula) return;

  badge.className = "badge " + action.kind;
  badge.innerText = action.kind.toUpperCase();

  let targetNode = reconstructed_tree ? reconstructed_tree.get(action.node_id) : null;
  let targetParent = (targetNode && reconstructed_tree) ? reconstructed_tree.getParent(targetNode) : null;

  switch (action.kind) {
    case "selection":
      highlightAlgoLine(2, "selection");
      if (targetNode && targetParent) {
        let pPos = (targetNode.data.move) ? getDisplayPos(targetNode.data.move.position) : "?";
        desc.innerHTML = `
          <div style="margin-bottom: 4px;">
            <b>Dòng 2: Selection (Chọn lọc nhánh)</b>
          </div>
          <div style="font-size: 11px; color: #475569; line-height: 1.45;">
            • <b>Cơ chế duyệt:</b> Theo biến <b>UCB1 lớn nhất</b> (duyệt có chủ đích, không đi ngẫu nhiên).<br>
            • <b>Mục tiêu:</b> Cân bằng giữa Khai thác (Exploitation) nhánh thắng nhiều và Khám phá (Exploration) nhánh ít thử.<br>
            • <b>Biến đang chạy:</b> Nút ID #${targetNode.id} (Ô [${pPos}]), Nút cha ID #${targetParent.id}.
          </div>
        `;
        showUCB1Formula(targetNode, targetParent, formula);
        showCandidatesTable(targetParent, targetNode.id, candidates);
      } else if (targetNode && targetNode.isRoot()) {
        desc.innerHTML = `
          <div style="margin-bottom: 4px;">
            <b>Dòng 2: Selection (Bắt đầu từ Root)</b>
          </div>
          <div style="font-size: 11px; color: #475569; line-height: 1.45;">
            • Bắt đầu lượt duyệt tại nút Gốc (Root) của bàn cờ hiện tại.<br>
            • <b>Biến:</b> N = ${targetNode.data.simulations}, V = ${targetNode.data.value}.
          </div>
        `;
        formula.innerHTML = `<b>Nút Gốc (Root):</b> N = ${targetNode.data.simulations}, V = ${targetNode.data.value}`;
        showCandidatesTable(targetNode, null, candidates);
      }
      break;

    case "expansion":
      highlightAlgoLine(4, "expansion");
      let pos0 = (final_tree && final_tree.get(action.node_id).data.move) ? final_tree.get(action.node_id).data.move.position : null;
      let displayPos = getDisplayPos(pos0);
      desc.innerHTML = `
        <div style="margin-bottom: 4px;">
          <b>Dòng 4: Expansion (Mở rộng nhánh mới)</b>
        </div>
        <div style="font-size: 11px; color: #475569; line-height: 1.45;">
          • <b>Cơ chế duyệt:</b> Chọn <b>ngẫu nhiên đều (Uniform Random)</b> trong tập các ô hợp lệ chưa từng được mở rộng.<br>
          • <b>Tại sao ngẫu nhiên?</b> Khi nút lá còn ô trống chưa thử, mọi nhánh chưa duyệt đều cần cơ hội bình đẳng được khám phá.<br>
          • <b>Biến đang chạy:</b> Mở rộng tại <b>ô số [${displayPos}]</b>.
        </div>
      `;
      formula.innerHTML = `
        <div style="font-weight: 600; color: #15803d;">Khởi tạo nút mới: Ô [${displayPos}]</div>
        <div style="font-size: 11px; color: #475569; margin-top: 3px; line-height: 1.4;">
          • Điểm tích lũy (V) = <b>0</b><br>
          • Lượt thăm (N) = <b>0</b><br>
          • Điểm UCB1 ngầm định = <b>&infin;</b> (Ưu tiên duyệt ít nhất 1 lần)
        </div>
      `;
      if (targetParent) {
        showCandidatesTable(targetParent, targetNode ? targetNode.id : null, candidates);
      }
      break;

    case "simulation":
      highlightAlgoLine(5, "simulation");
      let res = action.new_data ? action.new_data.result : "";
      let resText = (res === "m") ? "<span style='color: #dc2626; font-weight: bold;'>Máy (O) Thắng</span>" : 
                    (res === "h" ? "<span style='color: #2563eb; font-weight: bold;'>Người (X) Thắng</span>" : "<b>Hòa (Draw)</b>");
      let deltaScore = (res === "m") ? "+1 điểm (Máy)" : (res === "h" ? "-1 điểm (Người)" : "0 điểm (Hòa)");
      desc.innerHTML = `
        <div style="margin-bottom: 4px;">
          <b>Dòng 5: Simulation (Rollout mô phỏng)</b>
        </div>
        <div style="font-size: 11px; color: #475569; line-height: 1.45;">
          • <b>Cơ chế duyệt:</b> Đánh <b>ngẫu nhiên hoàn toàn (Uniform Random Rollout Policy)</b>.<br>
          • <b>Tại sao ngẫu nhiên?</b> Hai bên X và O luân phiên đi ngẫu nhiên đến khi kết thúc ván để ước lượng nhanh xác suất thắng mà không cần tri thức bàn cờ phức tạp.<br>
          • <b>Kết quả Rollout:</b> ${resText}.
        </div>
      `;
      formula.innerHTML = `
        <div style="font-weight: 600; color: #0369a1;">Kết quả Rollout ván cờ: ${resText}</div>
        <div style="font-size: 11px; color: #475569; margin-top: 3px; line-height: 1.4;">
          • Giá trị lan truyền: <b>${deltaScore}</b><br>
          • Kết thúc ván mô phỏng, chuẩn bị cập nhật ngược lên cây (Backpropagation).
        </div>
      `;
      break;

    case "backpropagation":
      highlightAlgoLine(6, "backpropagation");
      let oldV = action.old_data ? action.old_data.old_value : 0;
      let newV = action.new_data ? action.new_data.new_value : 0;
      let oldN = action.old_data ? action.old_data.old_visits : 0;
      let newN = action.new_data ? action.new_data.new_visits : 0;
      let winRate = (newN > 0) ? (newV / newN).toFixed(3) : "0.000";
      let vDiff = newV - oldV;
      let vDiffText = vDiff > 0 ? `+${vDiff}` : `${vDiff}`;
      desc.innerHTML = `
        <div style="margin-bottom: 4px;">
          <b>Dòng 6: Backpropagation (Lan truyền ngược)</b>
        </div>
        <div style="font-size: 11px; color: #475569; line-height: 1.45;">
          • <b>Cơ chế:</b> Cập nhật giá trị <b>ngược dòng từ nút lá về nút gốc</b> theo đúng đường đi của nhánh vừa duyệt.<br>
          • <b>Biến đang chạy:</b> Nút ID #${action.node_id}:<br>
          &nbsp;&nbsp;- Lượt thăm: <b>N: ${oldN} ➔ ${newN}</b> (+1)<br>
          &nbsp;&nbsp;- Giá trị tích lũy: <b>V: ${oldV} ➔ ${newV}</b> (${vDiffText})
        </div>
      `;
      formula.innerHTML = `
        <div style="font-weight: 600; color: #4338ca;">Cập nhật nút (ID #${action.node_id}):</div>
        <div style="font-size: 11px; color: #475569; margin-top: 3px; line-height: 1.4;">
          • Lượt thăm mới (N): <b>${newN}</b><br>
          • Điểm tích lũy (V): <b>${newV}</b><br>
          • Tỉ lệ thắng trung bình (V/N): <b>${winRate}</b>
        </div>
      `;
      if (targetParent) {
        showCandidatesTable(targetParent, targetNode ? targetNode.id : null, candidates);
      }
      break;

    case "finish":
      highlightAlgoLine(7, "finish");
      let bestMoveNode = reconstructed_tree ? reconstructed_tree.get(action.node_id) : null;
      let bestPos = (bestMoveNode && bestMoveNode.data.move) ? getDisplayPos(bestMoveNode.data.move.position) : "?";
      let bestN = bestMoveNode ? bestMoveNode.data.simulations : 0;
      desc.innerHTML = `
        <div style="margin-bottom: 4px;">
          <b style="color: #166534;">Dòng 7: Hoàn thành tìm kiếm (Make Move)</b>
        </div>
        <div style="font-size: 11px; color: #475569; line-height: 1.45;">
          • <b>Cơ chế quyết định:</b> Chọn theo <b>Max N (Lượt duyệt N nhiều nhất)</b>.<br>
          • <b>Tại sao không dùng UCB1?</b> Ở bước ra quyết định, điểm Khám phá không còn cần thiết; số lượt duyệt N phản ánh độ tin cậy hội tụ cao nhất.<br>
          • <b>Nước đi tối ưu:</b> Ô số <b>[${bestPos}]</b> với <b>N = ${bestN}</b> lượt mô phỏng.
        </div>
      `;
      formula.innerHTML = `
        <div style="color: #166534; font-weight: 600;">Nước đi được chọn: Ô [${bestPos}]</div>
        <div style="font-size: 11px; color: #475569; margin-top: 3px; line-height: 1.4;">
          Số lượt duyệt lớn nhất: <b>N = ${bestN}</b>.<br>
          Độ tin cậy thống kê cao nhất trong số các lựa chọn khả dĩ.
        </div>
      `;
      if (reconstructed_tree) {
        showCandidatesTable(reconstructed_tree.getRoot(), action.node_id, candidates);
      }
      break;
  }
}

function showUCB1Formula(node, parent, container) {
  let v = node.data.value;
  let n = node.data.simulations;
  let np = parent.data.simulations;
  let pos = (node.data.move) ? getDisplayPos(node.data.move.position) : "?";

  if (n === 0) {
    container.innerHTML = `
      <div style="font-weight: 600; color: #0284c7; margin-bottom: 2px;">Đang xét ô [${pos}]:</div>
      <div style="font-size: 11px; color: #475569;">N = 0 &rarr; UCB1 = <b>&infin;</b> (Chưa từng được mô phỏng)</div>
    `;
    return;
  }

  let exploitation = v / n;
  let logNp = Math.log(Math.max(np, 1));
  let exploration = Math.sqrt((2 * logNp) / n);
  let ucb1 = exploitation + exploration;

  container.innerHTML = `
    <div style="font-weight: 600; color: #0369a1; margin-bottom: 4px;">
      Đang đánh giá ô [${pos}]:
    </div>
    <div class="math-equation-box" style="margin-bottom: 6px; padding: 6px 8px;">
      <div class="math-eq" style="font-size: 12px;">
        <span style="font-weight: 600; color: #0284c7;">UCB1</span>&nbsp;=&nbsp;
        <span class="math-frac">
          <span class="math-num" style="color: #b91c1c; font-weight: 600;">${v}</span>
          <span class="math-den" style="font-weight: 600;">${n}</span>
        </span>
        &nbsp;+&nbsp;1.414 &middot;&nbsp;
        <span class="math-sqrt">
          <span class="math-radical">&radic;</span>
          <span class="math-sqrt-content">
            <span class="math-frac">
              <span class="math-num">ln(${np})</span>
              <span class="math-den">${n}</span>
            </span>
          </span>
        </span>
      </div>
    </div>
    <div style="font-size: 11px; line-height: 1.5; color: #334155;">
      • <b>Khai thác (Exploitation):</b> ${v}/${n} = <b style="color: #b91c1c;">${exploitation.toFixed(3)}</b><br>
      • <b>Khám phá (Exploration):</b> 1.414 &times; &radic;[ln(${np})/${n}] = <b style="color: #0284c7;">${exploration.toFixed(3)}</b><br>
      <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #7dd3fc; color: #0f172a; font-weight: bold; font-size: 12px;">
        ➔ Tổng UCB1 = ${exploitation.toFixed(3)} + ${exploration.toFixed(3)} = <span style="color: #0284c7;">${ucb1.toFixed(3)}</span>
      </div>
    </div>
  `;
}

function showCandidatesTable(parentNode, highlightedChildId, container) {
  if (!container || !parentNode || !reconstructed_tree) return;
  let children = reconstructed_tree.getChildren(parentNode);
  if (!children || children.length === 0) {
    container.innerHTML = "<div style='color: #94a3b8; font-style: italic;'>Không có nút con.</div>";
    return;
  }

  let html = `
    <table class="formula-table">
      <thead>
        <tr>
          <th>Ô (1-9)</th>
          <th>N</th>
          <th>V</th>
          <th>V/N</th>
          <th>UCB1</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let ch of children) {
    let pos = (ch.data.move) ? getDisplayPos(ch.data.move.position) : "?";
    let n = ch.data.simulations;
    let v = ch.data.value;
    let vn = (n > 0) ? (v / n).toFixed(2) : "-";
    let ucb = (n > 0) ? UCB1(ch, parentNode).toFixed(2) : "∞";
    let isSelected = (ch.id === highlightedChildId);
    let rowClass = isSelected ? "highlighted" : "";

    html += `
      <tr class="${rowClass}">
        <td><b>${pos}</b></td>
        <td>${n}</td>
        <td>${v}</td>
        <td>${vn}</td>
        <td><b>${ucb}</b></td>
      </tr>
    `;
  }

  html += "</tbody></table>";
  container.innerHTML = html;
}

function updateSidebarForHoveredNode(node) {
  if (!node || !reconstructed_tree) return;
  let formula = document.getElementById("sb_formula_sub");
  let candidates = document.getElementById("sb_candidates_area");
  
  if (node.isRoot()) {
    if (formula) formula.innerHTML = `<b>Nút Gốc (Root):</b> N = ${node.data.simulations}, V = ${node.data.value}`;
    if (candidates) showCandidatesTable(node, null, candidates);
  } else {
    let parent = reconstructed_tree.getParent(node);
    if (parent && formula) {
      showUCB1Formula(node, parent, formula);
    }
    if (candidates) {
      let children = reconstructed_tree.getChildren(node);
      if (children.length > 0) {
        showCandidatesTable(node, null, candidates);
      } else if (parent) {
        showCandidatesTable(parent, node.id, candidates);
      }
    }
  }
}

function makeDrawTree(tree) {
  let d_tree = tree.copy();

  d_tree.nodes.forEach((f) => { if (!f.isLeaf()) f.data.should_show_collapse_btn = true; })

  while (true) {
    for (var i = 0; i < d_tree.nodes.length; i++) {
      let parent = d_tree.getParent(d_tree.get(i));
      if (parent && parent.data.collapsed) {
        d_tree.remove(d_tree.get(i));
        i = 0;
      }
    }
    break;
  }

  return prepareTree(d_tree, {min_distance: 1});
}

function applyAction(action) {
  reconstructed_tree.nodes.forEach((f) => { 
    f.data.backpropagated = false;
    f.data.simulated = false;
    f.data.selected = false;
    f.data.expanded = false
  });

  switch (action.kind) {
    case "selection":
      reconstructed_tree.nodes.forEach((f) => {
        if (f.data.simulated_board) {
          reconstructed_tree.getParent(f).data.should_show_collapse_btn = false;
          reconstructed_tree.remove(f);
        }
      })
      reconstructed_tree.get(action.node_id).data.selected = true;
      break;
    case "expansion":
      let parent = reconstructed_tree.get(final_tree.getParent(final_tree.get(action.node_id)).id);
      reconstructed_tree.insert(new Node(new GameNode(final_tree.get(action.node_id).data.move)), parent);
      reconstructed_tree.get(action.node_id).data.action_id = totalActionsTillNow;
      reconstructed_tree.get(action.node_id).data.expanded = true;
      reconstructed_tree.get(action.node_id).data.collapsed = false;
      break;
    case "simulation":
      let simulated_node = new Node(new GameNode(reconstructed_tree.get(action.node_id).data.move.copy()));
      simulated_node.data.simulated_board = action.new_data.board;
      simulated_node.data.simulated = true;
      reconstructed_tree.insert(simulated_node, reconstructed_tree.get(action.node_id));
      break;
    case "backpropagation":
      reconstructed_tree.get(action.node_id).data.backpropagated = true;
      reconstructed_tree.get(action.node_id).data.value = action.new_data.new_value;
      reconstructed_tree.get(action.node_id).data.simulations = action.new_data.new_visits;
      break;
    case "finish":
      let best_move_node = reconstructed_tree.get(action.node_id);
      best_move_node.data.best_move = true;
      break;
  }
}

// CONTROL

function clickNextAction(send_tree=true) {
  if (isLastStep()) {
    transitionToState(VisualizationStates.LAST_STEP);
    return;
  }

  if (currentActionIdx == action_trace[currentIterationIdx].length - 1) {
    currentActionIdx = 0;
    currentIterationIdx += 1;
    totalActionsTillNow += 1;
  } else {
    currentActionIdx += 1;
    totalActionsTillNow += 1;
  }

  let action = action_trace[currentIterationIdx][currentActionIdx];
  applyAction(action);

  if (send_tree) {
    draw_tree = makeDrawTree(reconstructed_tree);
    sendDrawTree(draw_tree);

    transitionToState(VisualizationStates.VISUALIZING);
  }
}

function clickNextIteration(send_tree=true) {
  if (isLastStep()) {
    transitionToState(VisualizationStates.LAST_STEP);
    return;
  }

  let iteration = action_trace[currentIterationIdx];
  for (var i = currentActionIdx; i < iteration.length - 1; i++) {
    clickNextAction(false);
  }

  clickNextAction(send_tree); //last action sends the tree if necessary
}

function clickVisualizeLastStep() {
  for (var i = currentIterationIdx; i < action_trace.length; i++) {
    clickNextIteration(send_tree=false);
  }

  draw_tree = makeDrawTree(reconstructed_tree);

  draw_tree.nodes.forEach((node) => {
    let reconstructed_node = reconstructed_tree.nodes.find((f) => f.data.action_id == node.data.action_id);
    if (!reconstructed_node.isRoot()) {
      reconstructed_node.data.collapsed = true;
    }
  });

  draw_tree = makeDrawTree(reconstructed_tree);
  sendDrawTree(draw_tree);

  tree_vis_p5.focusNode(tree_vis_p5.tree.getRoot());
}

function clickMakePlay() {
  myp5.makeMove(best_move);
  myp5.endMove(best_move.player);
  transitionToState(VisualizationStates.NONE);
}

function isLastStep() {
  return currentIterationIdx == action_trace.length - 1
    && currentActionIdx == action_trace[action_trace.length - 1].length - 1;
}

function toggleCollapse(node) {
  let reconstructed_node = reconstructed_tree.nodes.find((f) => f.data.action_id == node.data.action_id);
  reconstructed_node.data.collapsed = !reconstructed_node.data.collapsed;
  
  draw_tree = makeDrawTree(reconstructed_tree);
  sendDrawTree(draw_tree);

  tree_vis_p5.focusNode(node, true);
}