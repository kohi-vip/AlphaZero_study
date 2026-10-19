# Configuration parameters for FinRL-style Stable-Baselines3 Agents
from __future__ import annotations

import os

# Đường dẫn lưu trữ mặc định
CHECKPOINT_DIR = os.path.join("practice", "TicTacToe_framework", "files", "FinRL_Checkpoints")
TENSORBOARD_LOG_DIR = "tensorboard_log"
RESULTS_DIR = "results"

# Siêu tham số DRL mặc định theo chuẩn FinRL config, tối ưu hóa cho bài toán Game/RL
DQN_PARAMS = {
    "learning_rate": 0.0005,
    "buffer_size": 20000,
    "learning_starts": 200,
    "batch_size": 64,
    "gamma": 0.99,
    "exploration_fraction": 0.4,
    "exploration_initial_eps": 1.0,
    "exploration_final_eps": 0.05,
    "target_update_interval": 250,
    "verbose": 0,
}

PPO_PARAMS = {
    "n_steps": 512,
    "ent_coef": 0.01,
    "learning_rate": 0.00025,
    "batch_size": 64,
    "gamma": 0.99,
    "clip_range": 0.2,
    "verbose": 0,
}

A2C_PARAMS = {
    "n_steps": 5,
    "ent_coef": 0.01,
    "learning_rate": 0.0007,
    "gamma": 0.99,
    "verbose": 0,
}

DDPG_PARAMS = {
    "batch_size": 64,
    "buffer_size": 20000,
    "learning_rate": 0.0005,
    "gamma": 0.99,
    "verbose": 0,
}

TD3_PARAMS = {
    "batch_size": 64,
    "buffer_size": 20000,
    "learning_rate": 0.0003,
    "learning_starts": 150,
    "gamma": 0.99,
    "verbose": 0,
}

SAC_PARAMS = {
    "batch_size": 64,
    "buffer_size": 20000,
    "learning_rate": 0.0003,
    "learning_starts": 150,
    "ent_coef": "auto_0.1",
    "gamma": 0.99,
    "verbose": 0,
}

TQC_PARAMS = {
    "batch_size": 64,
    "buffer_size": 20000,
    "learning_rate": 0.0003,
    "learning_starts": 150,
    "ent_coef": "auto_0.1",
    "top_quantiles_to_drop_per_net": 2,
    "verbose": 0,
}

CROSSQ_PARAMS = {
    "batch_size": 64,
    "buffer_size": 20000,
    "learning_rate": 0.0005,
    "learning_starts": 150,
    "ent_coef": "auto",
    "verbose": 0,
}

