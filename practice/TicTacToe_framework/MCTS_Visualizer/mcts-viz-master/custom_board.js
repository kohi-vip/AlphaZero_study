// =============================================================================
// QUẢN LÝ CHẾ ĐỘ TỰ CHƠI / XẾP THẾ CỜ (CUSTOM BOARD) & LƯU TRỮ LOCALSTORAGE
// =============================================================================

const PRESET_BOARDS = {
    "fork_corner": {
        name: "1. Bẫy Fork Góc (X ở ô 1, 9, O ở tâm ô 5)",
        grid: ["h", "", "", "", "m", "", "", "", "h"],
        turn: 1 // Đến lượt Machine (O)
    },
    "block_win": {
        name: "2. Thế Buộc Chặn (X sắp 3 ô hàng trên: ô 1, 2)",
        grid: ["h", "h", "", "", "m", "", "", "", ""],
        turn: 1 // Đến lượt Machine (O)
    },
    "double_threat": {
        name: "3. Chặn Đôi Hiểm Hóc (Endgame trống ô 7, 8, 9)",
        grid: ["h", "m", "h", "m", "m", "h", "", "", ""],
        turn: 0 // Đến lượt Human (X)
    },
    "side_trap": {
        name: "4. Bẫy Cạnh (X ô 5, O ô 2)",
        grid: ["", "m", "", "", "h", "", "", "", ""],
        turn: 0 // Đến lượt Human (X)
    }
};

class CustomBoardManager {
    constructor() {
        this.isCustomMode = false;
        this.savedBoardsKey = "mcts_viz_saved_boards";
    }

    init() {
        this.loadSavedBoardsList();
    }

    toggleCustomMode() {
        this.isCustomMode = !this.isCustomMode;
        let btn = document.getElementById("btn_custom_mode");
        let panel = document.getElementById("custom_mode_panel");
        
        if (this.isCustomMode) {
            btn.style.background = "#f59e0b";
            btn.style.color = "#ffffff";
            btn.innerText = "Đang ở chế độ Xếp cờ (Bấm để tắt)";
            if (panel) panel.style.display = "block";
        } else {
            btn.style.background = "#ffffff";
            btn.style.color = "#1e293b";
            btn.innerText = "✏️ Tự chơi / Xếp thế cờ";
            if (panel) panel.style.display = "none";
        }
    }

    setTurn(player) {
        if (typeof myp5 !== "undefined" && myp5.selectStartingPlayer) {
            myp5.selectStartingPlayer(player);
        }
        if (typeof transitionToState === "function" && typeof VisualizationStates !== "undefined") {
            transitionToState(VisualizationStates.NONE);
        }
    }

    clearBoard() {
        if (typeof TTT_BOARD !== "undefined") {
            TTT_BOARD.grid = (new Array(9)).fill("");
            this.setTurn(0);
        }
    }

    setPreset(presetKey) {
        if (!presetKey || !PRESET_BOARDS[presetKey]) return;
        let p = PRESET_BOARDS[presetKey];
        if (typeof TTT_BOARD !== "undefined") {
            TTT_BOARD.grid = p.grid.slice();
            this.setTurn(p.turn);
        }
    }

    saveCurrentBoard() {
        let input = document.getElementById("input_board_name");
        let name = input ? input.value.trim() : "";
        if (!name) {
            alert("Vui lòng nhập tên cho thế cờ cần lưu!");
            return;
        }

        let saved = this.getSavedBoards();
        saved[name] = {
            grid: TTT_BOARD.grid.slice(),
            turn: whoseTurn,
            date: new Date().toLocaleDateString()
        };

        localStorage.setItem(this.savedBoardsKey, JSON.stringify(saved));
        this.loadSavedBoardsList();
        if (input) input.value = "";
        alert(`✅ Đã lưu thế cờ "${name}" thành công vào bộ nhớ trình duyệt!`);
    }

    getSavedBoards() {
        try {
            let data = localStorage.getItem(this.savedBoardsKey);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    loadSavedBoardsList() {
        let select = document.getElementById("select_saved_boards");
        if (!select) return;
        select.innerHTML = '<option value="">-- Thế cờ bạn đã lưu --</option>';
        let saved = this.getSavedBoards();
        for (let name in saved) {
            let opt = document.createElement("option");
            opt.value = name;
            opt.innerText = `${name} (${saved[name].date || ''})`;
            select.appendChild(opt);
        }
    }

    loadSelectedSavedBoard(name) {
        if (!name) return;
        let saved = this.getSavedBoards();
        if (saved[name] && typeof TTT_BOARD !== "undefined") {
            TTT_BOARD.grid = saved[name].grid.slice();
            this.setTurn(saved[name].turn);
        }
    }

    deleteCurrentSavedBoard() {
        let select = document.getElementById("select_saved_boards");
        let name = select ? select.value : "";
        if (!name) {
            alert("Hãy chọn thế cờ cần xóa trong danh sách!");
            return;
        }
        if (confirm(`Bạn có chắc chắn muốn xóa thế cờ "${name}"?`)) {
            let saved = this.getSavedBoards();
            delete saved[name];
            localStorage.setItem(this.savedBoardsKey, JSON.stringify(saved));
            this.loadSavedBoardsList();
            alert(`Đã xóa thế cờ "${name}".`);
        }
    }

    setQuickRollouts(val) {
        let slider = document.getElementById("mcts_timeout_slider");
        let span = document.getElementById("mcts_timeout_span");
        if (slider && span) {
            slider.value = val;
            span.innerText = val;
        }
    }
}

const customBoardManager = new CustomBoardManager();
