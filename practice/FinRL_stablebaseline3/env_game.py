# Game Environment for FinRL-style Agents
from __future__ import annotations

import random
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

try:
    import gymnasium as gym
    from gymnasium import spaces
except ImportError:
    import gym
    from gym import spaces

from stable_baselines3.common.vec_env import DummyVecEnv

WIN_COMBINATIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],  # Hàng ngang
    [0, 3, 6], [1, 4, 7], [2, 5, 8],  # Hàng dọc
    [0, 4, 8], [2, 4, 6]              # Đường chéo
]

def check_winner(board: np.ndarray) -> Optional[int]:
    """
    Kiểm tra trạng thái bàn cờ:
    - 1: X (Agent) thắng
    - -1: O (Đối thủ) thắng
    - 0: Hòa cờ
    - None: Ván cờ chưa kết thúc
    """
    for line in WIN_COMBINATIONS:
        s = board[line[0]] + board[line[1]] + board[line[2]]
        if s == 3:
            return 1
        elif s == -3:
            return -1
    if 0 not in board:
        return 0
    return None

def minimax_search(board: np.ndarray, depth: int, is_maximizing: bool, player_mark: int) -> Tuple[float, Optional[int]]:
    """Thuật toán Minimax tìm nước đi tối ưu cho đối thủ."""
    winner = check_winner(board)
    if winner is not None:
        return winner * player_mark, None

    best_move = None
    if is_maximizing:
        max_eval = -float('inf')
        for i in range(9):
            if board[i] == 0:
                board[i] = player_mark
                eval_score, _ = minimax_search(board, depth + 1, False, player_mark)
                board[i] = 0
                if eval_score > max_eval:
                    max_eval = eval_score
                    best_move = i
        return max_eval, best_move
    else:
        min_eval = float('inf')
        opp_mark = -player_mark
        for i in range(9):
            if board[i] == 0:
                board[i] = opp_mark
                eval_score, _ = minimax_search(board, depth + 1, True, player_mark)
                board[i] = 0
                if eval_score < min_eval:
                    min_eval = eval_score
                    best_move = i
        return min_eval, best_move

def get_opponent_move(board: np.ndarray, opp_type: str = "minimax", opp_mark: int = -1, random_rate: float = 0.2) -> Optional[int]:
    """Lấy nước đi của đối thủ (Minimax với tỉ lệ ngẫu nhiên hoặc thuần Random)."""
    empty_cells = [i for i in range(9) if board[i] == 0]
    if not empty_cells:
        return None
    if opp_type == "random" or random.random() < random_rate:
        return random.choice(empty_cells)
    _, best_move = minimax_search(board, 0, True, opp_mark)
    return best_move if best_move is not None else random.choice(empty_cells)


class BaseTicTacToeEnv(gym.Env):
    """Môi trường cơ sở cho Tic-Tac-Toe tương thích Gym/Gymnasium và FinRL API."""
    metadata = {"render_modes": ["human"]}

    def __init__(self, opponent_type: str = "minimax", first_player_random: bool = True):
        super().__init__()
        self.opponent_type = opponent_type
        self.first_player_random = first_player_random
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(9,), dtype=np.float32)
        self.board = np.zeros(9, dtype=np.int8)
        self.current_step = 0

    def reset(self, seed: Optional[int] = None, options: Optional[dict] = None) -> Tuple[np.ndarray, dict]:
        super().reset(seed=seed)
        self.board = np.zeros(9, dtype=np.int8)
        self.current_step = 0
        if self.first_player_random and random.random() < 0.5:
            opp_first_move = get_opponent_move(self.board, opp_type="random", opp_mark=-1)
            if opp_first_move is not None:
                self.board[opp_first_move] = -1
        obs = self.board.astype(np.float32)
        return obs, {}

    def get_sb_env(self) -> Tuple[DummyVecEnv, np.ndarray]:
        """Chuẩn hóa phương thức trích xuất vectorized env theo phong cách FinRL."""
        def _init():
            return self
        e = DummyVecEnv([_init])
        obs = e.reset()
        return e, obs

    def render(self, mode: str = "human"):
        symbols = {1: ' X ', -1: ' O ', 0: ' . '}
        print("\n-------------")
        for row in range(3):
            print("|" + "|".join([symbols[self.board[row*3 + col]] for col in range(3)]) + "|")
            print("-------------")


class TicTacToeDiscreteEnv(BaseTicTacToeEnv):
    """Môi trường không gian rời rạc Discrete(9) cho DQN, PPO, A2C."""
    def __init__(self, opponent_type: str = "minimax", first_player_random: bool = True):
        super().__init__(opponent_type=opponent_type, first_player_random=first_player_random)
        self.action_space = spaces.Discrete(9)

    def step(self, action: Union[int, np.ndarray]) -> Tuple[np.ndarray, float, bool, bool, dict]:
        action = int(action)
        self.current_step += 1

        # 1. Phạt nếu đánh vào ô không hợp lệ (đã có quân)
        if self.board[action] != 0:
            reward = -1.0
            return self.board.astype(np.float32), reward, True, False, {"result": "invalid"}

        # 2. Agent X đánh vào ô action
        self.board[action] = 1
        status = check_winner(self.board)
        if status == 1:
            return self.board.astype(np.float32), 1.0, True, False, {"result": "win"}
        elif status == 0:
            return self.board.astype(np.float32), 0.2, True, False, {"result": "draw"}

        # 3. Đối thủ O phản công
        opp_move = get_opponent_move(self.board, opp_type=self.opponent_type, opp_mark=-1)
        if opp_move is not None:
            self.board[opp_move] = -1

        # 4. Kiểm tra kết quả sau lượt đối thủ
        status = check_winner(self.board)
        if status == -1:
            return self.board.astype(np.float32), -1.0, True, False, {"result": "loss"}
        elif status == 0:
            return self.board.astype(np.float32), 0.2, True, False, {"result": "draw"}

        return self.board.astype(np.float32), 0.05, False, False, {"result": "ongoing"}


class TicTacToeContinuousEnv(BaseTicTacToeEnv):
    """Môi trường không gian liên tục Box(-1, 1, (9,)) cho SAC, TD3, DDPG."""
    def __init__(self, opponent_type: str = "minimax", first_player_random: bool = True):
        super().__init__(opponent_type=opponent_type, first_player_random=first_player_random)
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(9,), dtype=np.float32)

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, dict]:
        self.current_step += 1
        act_vec = np.array(action).flatten()

        empty_cells = [i for i in range(9) if self.board[i] == 0]
        if not empty_cells:
            return self.board.astype(np.float32), 0.0, True, False, {"result": "draw"}

        # Chọn ô trống có điểm số cao nhất từ output liên tục
        discrete_action = max(empty_cells, key=lambda c: act_vec[c])
        self.board[discrete_action] = 1

        status = check_winner(self.board)
        if status == 1:
            return self.board.astype(np.float32), 1.0, True, False, {"result": "win"}
        elif status == 0:
            return self.board.astype(np.float32), 0.2, True, False, {"result": "draw"}

        opp_move = get_opponent_move(self.board, opp_type=self.opponent_type, opp_mark=-1)
        if opp_move is not None:
            self.board[opp_move] = -1

        status = check_winner(self.board)
        if status == -1:
            return self.board.astype(np.float32), -1.0, True, False, {"result": "loss"}
        elif status == 0:
            return self.board.astype(np.float32), 0.2, True, False, {"result": "draw"}

        return self.board.astype(np.float32), 0.05, False, False, {"result": "ongoing"}

