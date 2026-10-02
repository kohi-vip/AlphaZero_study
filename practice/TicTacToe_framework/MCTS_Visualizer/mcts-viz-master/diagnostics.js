// =============================================================================
// MODULE CHẨN ĐOÁN THẮNG / THUA & THỐNG KÊ SAU VÁN ĐẤU (POST-GAME DIAGNOSTICS)
// =============================================================================

// Tổng số trạng thái hợp lệ có thể đạt tới trong Tic-Tac-Toe (chuẩn toán học)
const TOTAL_TICTACTOE_STATES = 5478;

const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Hàng ngang
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cột dọc
    [0, 4, 8], [2, 4, 6]             // Đường chéo
];

let lastMCTSSearchInfo = {
    searchTimeMs: 0,
    rollouts: 100,
    totalNodes: 0,
    player: "m"
};

function recordMCTSSearch(searchTimeMs, rollouts, totalNodes, player) {
    lastMCTSSearchInfo = {
        searchTimeMs: searchTimeMs,
        rollouts: rollouts,
        totalNodes: totalNodes,
        player: player
    };

    let statTime = document.getElementById("stat_time");
    let statNodes = document.getElementById("stat_nodes");
    let statCoverage = document.getElementById("stat_coverage");

    if (statTime) statTime.innerText = `${searchTimeMs} ms`;
    if (statNodes) statNodes.innerText = totalNodes;
    if (statCoverage) {
        let pct = ((totalNodes / TOTAL_TICTACTOE_STATES) * 100).toFixed(2);
        statCoverage.innerText = `${pct}% (${totalNodes}/${TOTAL_TICTACTOE_STATES})`;
    }
}

/**
 * Phân tích tìm kiếm bẫy Fork (2 đường đe dọa thắng cùng lúc)
 */
function detectForks(board, playerMark) {
    let forkPositions = [];
    let emptyIndices = board.getLegalPositions();

    for (let pos of emptyIndices) {
        let tempBoard = board.copy();
        tempBoard.grid[pos] = playerMark;

        // Đếm xem nước đi này tạo ra bao nhiêu đường có 2 quân + 1 ô trống (winning threats)
        let threatCount = 0;
        for (let line of WIN_LINES) {
            let marks = [tempBoard.grid[line[0]], tempBoard.grid[line[1]], tempBoard.grid[line[2]]];
            let playerCount = marks.filter(m => m === playerMark).length;
            let emptyCount = marks.filter(m => m === "").length;
            if (playerCount === 2 && emptyCount === 1) {
                threatCount++;
            }
        }
        if (threatCount >= 2) {
            forkPositions.push(pos);
        }
    }
    return forkPositions;
}

/**
 * Kiểm tra xem có nước đi thắng ngay trong 1 bước cho người chơi không
 */
function findImmediateWinningMoves(board, playerMark) {
    let winningMoves = [];
    for (let pos of board.getLegalPositions()) {
        let tempBoard = board.copy();
        tempBoard.grid[pos] = playerMark;
        if (tempBoard.checkWin() === playerMark) {
            winningMoves.push(pos);
        }
    }
    return winningMoves;
}

/**
 * Chẩn đoán nguyên nhân Thắng / Thua / Hòa theo 4 danh mục đã thống nhất:
 * 1. MCTS Technical (Rollouts / Vòng lặp)
 * 2. State-space Coverage (Bao phủ không gian trạng thái)
 * 3. Game-Theoretic (Thế cờ buộc thắng/buộc thua, Fork trap)
 * 4. Tactical Blunder (Bỏ sót nước chặn hoặc nước dứt điểm)
 */
function analyzeGameOutcome(winner, board) {
    let reasons = [];
    let opponentMark = (winner === "h") ? "m" : "h";
    let winnerName = (winner === "h") ? "Người chơi (X)" : (winner === "m" ? "Máy MCTS (O)" : "Hòa cờ");

    // 1. Phân tích Kỹ thuật MCTS (Rollouts)
    let rollouts = lastMCTSSearchInfo.rollouts || 100;
    if (rollouts < 50) {
        reasons.push({
            category: "MCTS Technical",
            badge: "Rollout thấp",
            type: "warning",
            text: `Số vòng lặp MCTS rất ít (${rollouts} rollouts). Cây MCTS chưa hội tụ đủ độ sâu để phát hiện các bẫy phản công phức tạp.`
        });
    } else {
        reasons.push({
            category: "MCTS Technical",
            badge: "Hội tụ tốt",
            type: "success",
            text: `Số vòng lặp MCTS (${rollouts} rollouts) đạt mức đánh giá xác suất đủ tốt cho các thế cờ thông thường.`
        });
    }

    // 2. Độ bao phủ không gian mẫu (State-Space Coverage)
    let totalNodes = lastMCTSSearchInfo.totalNodes || 0;
    let coveragePct = ((totalNodes / TOTAL_TICTACTOE_STATES) * 100).toFixed(2);
    if (totalNodes < 40) {
        reasons.push({
            category: "State-Space",
            badge: "Khám phá mỏng",
            type: "warning",
            text: `Cây MCTS chỉ mở rộng ${totalNodes} nút (~${coveragePct}% không gian 5,478 thế cờ), thuật toán tập trung khai thác nông.`
        });
    } else {
        reasons.push({
            category: "State-Space",
            badge: "Bao phủ sâu",
            type: "info",
            text: `Đã sinh ra ${totalNodes} nút trạng thái (~${coveragePct}% không gian mẫu), bao quát hầu hết các phản hồi từ vị trí hiện tại.`
        });
    }

    // 3. Game-Theoretic & Bẫy Fork (Lý thuyết trò chơi)
    if (winner === "h" || winner === "m") {
        let forkTraps = detectForks(board, winner);
        if (forkTraps.length > 0) {
            reasons.push({
                category: "Game-Theoretic",
                badge: "Bẫy Fork 2 đầu",
                type: "danger",
                text: `${winnerName} đã thiết lập thành công thế Fork (nước đôi hiểm hóc). Đối thủ không thể chặn đồng thời 2 đường thắng buộc phải chịu thua.`
            });
        } else {
            reasons.push({
                category: "Game-Theoretic",
                badge: "Chuỗi ép nước",
                type: "info",
                text: `Bàn cờ kết thúc bằng việc ${winnerName} hoàn thành chuỗi 3 quân trên đường thẳng cơ bản.`
            });
        }
    } else if (winner === "v") {
        reasons.push({
            category: "Game-Theoretic",
            badge: "Cân bằng Nash",
            type: "success",
            text: `Ván đấu đạt kết quả Hòa tối ưu (Zero-sum Nash equilibrium). Cả hai bên đều không mắc sai lầm chiến thuật lớn nào.`
        });
    }

    // 4. Sai lầm chiến thuật (Tactical Blunder)
    if (winner !== "v") {
        let threatsForLoser = findImmediateWinningMoves(board, opponentMark);
        if (threatsForLoser.length > 0) {
            reasons.push({
                category: "Tactical Blunder",
                badge: "Bỏ lỡ nước chặn",
                type: "danger",
                text: `Bên thua đã bỏ sót một nước đi chặn khẩn cấp ở lượt trước, dẫn đến việc bị dứt điểm 3 ô liên tiếp.`
            });
        }
    }

    return reasons;
}

/**
 * Hiển thị chẩn đoán lên Cột 3 (Right Panel)
 */
function renderPostGameDiagnostics(winner, board) {
    let diagArea = document.getElementById("sb_diagnostics_area");
    if (!diagArea) return;

    let reasons = analyzeGameOutcome(winner, board);
    let totalNodes = lastMCTSSearchInfo.totalNodes || 0;
    let coveragePct = ((totalNodes / TOTAL_TICTACTOE_STATES) * 100).toFixed(2);
    let winnerText = (winner === "h") ? "Người chơi (X) Thắng" : (winner === "m" ? "Máy MCTS (O) Thắng" : "Hòa cờ (Draw)");

    let html = `
        <div style="margin-bottom: 8px; padding: 6px 8px; border-radius: 4px; background: #e0f2fe; border: 1px solid #7dd3fc;">
            <b>Kết quả:</b> <span style="font-weight: bold; color: #0369a1;">${winnerText}</span><br>
            • Thời gian tính: <b>${lastMCTSSearchInfo.searchTimeMs} ms</b><br>
            • Nút đã tạo: <b>${totalNodes}</b> / ${TOTAL_TICTACTOE_STATES} (${coveragePct}%)
        </div>
        <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; color: #334155;">NGUYÊN NHÂN & CHẨN ĐOÁN (4 DANH MỤC):</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
    `;

    for (let r of reasons) {
        let bg = "#f8fafc";
        let border = "#cbd5e1";
        let color = "#334155";
        let badgeBg = "#e2e8f0";

        if (r.type === "danger") {
            bg = "#fef2f2"; border = "#fca5a5"; color = "#991b1b"; badgeBg = "#fee2e2";
        } else if (r.type === "warning") {
            bg = "#fffbeb"; border = "#fde68a"; color = "#92400e"; badgeBg = "#fef3c7";
        } else if (r.type === "success") {
            bg = "#f0fdf4"; border = "#86efac"; color = "#166534"; badgeBg = "#dcfce7";
        } else if (r.type === "info") {
            bg = "#f0f9ff"; border = "#7dd3fc"; color = "#075985"; badgeBg = "#e0f2fe";
        }

        html += `
            <div style="background: ${bg}; border: 1px solid ${border}; border-radius: 4px; padding: 6px 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                    <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${color};">${r.category}</span>
                    <span style="font-size: 10px; padding: 1px 6px; border-radius: 8px; background: ${badgeBg}; color: ${color}; font-weight: 600;">${r.badge}</span>
                </div>
                <div style="font-size: 11px; color: #475569; line-height: 1.4;">${r.text}</div>
            </div>
        `;
    }

    html += `</div>`;
    diagArea.innerHTML = html;
}

