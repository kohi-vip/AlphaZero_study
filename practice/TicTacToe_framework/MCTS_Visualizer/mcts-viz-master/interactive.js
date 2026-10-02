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

function resetLiveSidebar() {
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
      desc.innerHTML = "Duyệt từ nút gốc xuống nút lá theo chỉ số <b>UCB1 lớn nhất</b>.";
      if (targetNode && targetParent) {
        showUCB1Formula(targetNode, targetParent, formula);
        showCandidatesTable(targetParent, targetNode.id, candidates);
      } else if (targetNode && targetNode.isRoot()) {
        formula.innerHTML = `<b>Nút Gốc (Root):</b> N = ${targetNode.data.simulations}, V = ${targetNode.data.value}`;
        showCandidatesTable(targetNode, null, candidates);
      }
      break;

    case "expansion":
      let pos = (final_tree && final_tree.get(action.node_id).data.move) ? final_tree.get(action.node_id).data.move.position : "?";
      desc.innerHTML = `Mở rộng thêm nút con mới tại <b>ô số ${pos}</b> từ nút lá chưa xét hết.`;
      formula.innerHTML = `
        <div><b>Khởi tạo nút mới (Ô ${pos}):</b></div>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">
          • Giá trị (V) = 0<br>
          • Lượt thăm (N) = 0<br>
          • Điểm UCB1 = ∞ (Ưu tiên mô phỏng ít nhất 1 lần)
        </div>
      `;
      if (targetParent) {
        showCandidatesTable(targetParent, targetNode ? targetNode.id : null, candidates);
      }
      break;

    case "simulation":
      let res = action.new_data ? action.new_data.result : "";
      let resText = (res === "m") ? "<span style='color: #dc2626; font-weight: bold;'>Máy (O) Thắng</span>" : 
                    (res === "h" ? "<span style='color: #2563eb; font-weight: bold;'>Người (X) Thắng</span>" : "<b>Hòa (Draw)</b>");
      let deltaScore = (res === "m") ? "+1 điểm" : (res === "h" ? "-1 điểm" : "0 điểm");
      desc.innerHTML = `Thực hiện Rollout ngẫu nhiên cho đến kết thúc ván: ${resText}.`;
      formula.innerHTML = `
        <div><b>Kết quả Rollout:</b> ${resText}</div>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">
          • Điểm lan truyền: <b>${deltaScore}</b><br>
          • Ván cờ mô phỏng kết thúc, chuẩn bị cập nhật ngược lên cây (Backpropagation).
        </div>
      `;
      break;

    case "backpropagation":
      let oldV = action.old_data ? action.old_data.old_value : 0;
      let newV = action.new_data ? action.new_data.new_value : 0;
      let oldN = action.old_data ? action.old_data.old_visits : 0;
      let newN = action.new_data ? action.new_data.new_visits : 0;
      desc.innerHTML = `Lan truyền kết quả ngược lên gốc: Cập nhật <b>N: ${oldN} ➔ ${newN}</b>, <b>V: ${oldV} ➔ ${newV}</b>.`;
      let winRate = (newN > 0) ? (newV / newN).toFixed(3) : "0.000";
      formula.innerHTML = `
        <div><b>Cập nhật nút:</b></div>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">
          • Lượt thăm mới (N): <b>${newN}</b> (+1)<br>
          • Điểm tích lũy (V): <b>${newV}</b><br>
          • Tỉ lệ thắng trung bình (V/N): <b>${winRate}</b>
        </div>
      `;
      if (targetParent) {
        showCandidatesTable(targetParent, targetNode ? targetNode.id : null, candidates);
      }
      break;

    case "finish":
      let bestMoveNode = reconstructed_tree ? reconstructed_tree.get(action.node_id) : null;
      let bestPos = (bestMoveNode && bestMoveNode.data.move) ? bestMoveNode.data.move.position : "?";
      desc.innerHTML = `<span style='color: #166534; font-weight: bold;'>HOÀN THÀNH TÌM KIẾM!</span> Chọn nước đi tối ưu tại <b>ô số ${bestPos}</b>.`;
      formula.innerHTML = `
        <div><b>Nước đi tối ưu: Ô ${bestPos}</b></div>
        <div style="font-size: 11px; color: #166534; margin-top: 2px;">
          Tiêu chuẩn chọn: <b>Max N (Lượt mô phỏng nhiều nhất)</b>.<br>
          Số lượt duyệt lớn đảm bảo thuật toán đã hội tụ và giảm thiểu rủi ro ngẫu nhiên.
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
  let pos = (node.data.move) ? node.data.move.position : "?";

  if (n === 0) {
    container.innerHTML = `<div><b>Ô ${pos}:</b> N = 0 ➔ UCB1 = ∞</div>`;
    return;
  }

  let exploitation = v / n;
  let logNp = Math.log(Math.max(np, 1));
  let exploration = Math.sqrt((2 * logNp) / n);
  let ucb1 = exploitation + exploration;

  container.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 3px;">Đang xét ô [${pos}]:</div>
    <div style="font-size: 11px; line-height: 1.4;">
      • Khai thác (V/N) = ${v} / ${n} = <b>${exploitation.toFixed(3)}</b><br>
      • Khám phá = √[2 * ln(${np}) / ${n}] = <b>${exploration.toFixed(3)}</b><br>
      <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #7dd3fc; color: #0369a1; font-weight: bold;">
        ➔ UCB1 = ${exploitation.toFixed(3)} + ${exploration.toFixed(3)} = ${ucb1.toFixed(3)}
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
          <th>Ô</th>
          <th>N</th>
          <th>V</th>
          <th>V/N</th>
          <th>UCB1</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let ch of children) {
    let pos = (ch.data.move) ? ch.data.move.position : "?";
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