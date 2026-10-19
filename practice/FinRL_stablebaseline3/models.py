# DRL models adapted from FinRL Stable-Baselines3 for Game Environments
from __future__ import annotations

import os
import time
import statistics
from typing import Any, Dict, List, Optional, Tuple, Type, Union

import numpy as np
import matplotlib.pyplot as plt

try:
    from sb3_contrib import CrossQ, TQC
    HAS_SB3_CONTRIB = True
except ImportError:
    HAS_SB3_CONTRIB = False

from stable_baselines3 import A2C, DDPG, DQN, PPO, SAC, TD3
from stable_baselines3.common.callbacks import BaseCallback, CallbackList
from stable_baselines3.common.noise import NormalActionNoise, OrnsteinUhlenbeckActionNoise
from stable_baselines3.common.vec_env import DummyVecEnv

from practice.FinRL_stablebaseline3 import config

# Danh mục mô hình DRL hỗ trợ theo chuẩn FinRL
MODELS: Dict[str, Any] = {
    "dqn": DQN,
    "ppo": PPO,
    "a2c": A2C,
    "sac": SAC,
    "td3": TD3,
    "ddpg": DDPG,
}

if HAS_SB3_CONTRIB:
    MODELS["tqc"] = TQC
    MODELS["crossq"] = CrossQ

# Ánh xạ siêu tham số từ config
MODEL_KWARGS: Dict[str, dict] = {
    "dqn": config.DQN_PARAMS,
    "ppo": config.PPO_PARAMS,
    "a2c": config.A2C_PARAMS,
    "sac": config.SAC_PARAMS,
    "td3": config.TD3_PARAMS,
    "ddpg": config.DDPG_PARAMS,
    "tqc": config.TQC_PARAMS,
    "crossq": config.CROSSQ_PARAMS,
}

NOISE: Dict[str, Any] = {
    "normal": NormalActionNoise,
    "ornstein_uhlenbeck": OrnsteinUhlenbeckActionNoise,
}


class TensorboardCallback(BaseCallback):
    """Callback chuẩn ghi log Tensorboard theo phong cách FinRL."""
    def __init__(self, verbose: int = 0):
        super().__init__(verbose)

    def _on_step(self) -> bool:
        try:
            if "rewards" in self.locals:
                self.logger.record(key="train/reward", value=float(self.locals["rewards"][0]))
            elif "reward" in self.locals:
                self.logger.record(key="train/reward", value=float(self.locals["reward"][0]))
        except Exception:
            pass
        return True


class GameMetricsCallback(BaseCallback):
    """
    Callback thu thập Loss, Q-values và Rewards trong suốt quá trình huấn luyện
    dành cho Game và kiểm tra hội tụ mô hình.
    """
    def __init__(self, eval_freq: int = 100, verbose: int = 0):
        super().__init__(verbose)
        self.eval_freq = eval_freq
        self.timesteps: List[int] = []
        self.losses: List[float] = []
        self.q_values: List[float] = []
        self.ep_rewards: List[float] = []

        # Các trạng thái mẫu theo dõi Q-value tại các thời điểm t (mở cờ, chiếm tâm, đối kháng)
        self.sample_states = np.array([
            [0, 0, 0, 0, 0, 0, 0, 0, 0],      # t=0: Trống
            [0, 0, 0, 0, 1, 0, 0, 0, 0],      # t=1: X chiếm tâm
            [1, 0, 0, 0, -1, 0, 0, 0, 1],     # t=3: X 2 góc, O ở tâm
        ], dtype=np.float32)

    def _on_step(self) -> bool:
        if "rewards" in self.locals:
            self.ep_rewards.append(float(np.mean(self.locals["rewards"])))

        if self.n_calls % self.eval_freq == 0:
            self.timesteps.append(self.num_timesteps)

            # 1. Trích xuất Loss
            step_loss = 0.0
            if hasattr(self.model, "logger") and self.model.logger:
                for key in ["train/loss", "train/critic_loss", "train/value_loss", "train/policy_loss"]:
                    if key in self.model.logger.name_to_value:
                        step_loss = float(self.model.logger.name_to_value[key])
                        break
            self.losses.append(step_loss)

            # 2. Đo lường giá trị Q / Value Function tại các trạng thái t
            q_mean = 0.0
            try:
                import torch
                obs_tensor = torch.as_tensor(self.sample_states, device=self.model.device)
                with torch.no_grad():
                    if hasattr(self.model, "q_net"):
                        q_out = self.model.q_net(obs_tensor)
                        q_mean = float(q_out.max(dim=1).values.mean().item())
                    elif hasattr(self.model, "critic") and hasattr(self.model, "actor"):
                        actions = self.model.actor(obs_tensor)
                        q_out = self.model.critic(obs_tensor, actions)[0]
                        q_mean = float(q_out.mean().item())
                    elif hasattr(self.model, "policy") and hasattr(self.model.policy, "predict_values"):
                        val_out = self.model.policy.predict_values(obs_tensor)
                        q_mean = float(val_out.mean().item())
            except Exception:
                q_mean = float(np.mean(self.ep_rewards[-10:])) if self.ep_rewards else 0.0

            self.q_values.append(q_mean)
        return True


class DRLAgent:
    """
    Chuẩn hóa Lớp DRLAgent của FinRL dành cho Stable-Baselines3.
    Cung cấp giao diện nhất quán để khởi tạo, huấn luyện, lưu trữ và dự đoán với các mô hình DRL.
    """
    def __init__(self, env: Any):
        # Tự động chuyển đổi sang DummyVecEnv nếu là môi trường đơn
        if hasattr(env, "get_sb_env"):
            self.env, _ = env.get_sb_env()
        elif not isinstance(env, DummyVecEnv) and hasattr(env, "reset"):
            self.env = DummyVecEnv([lambda: env])
        else:
            self.env = env

    def get_model(
        self,
        model_name: str,
        policy: str = "MlpPolicy",
        policy_kwargs: Optional[dict] = None,
        model_kwargs: Optional[dict] = None,
        verbose: int = 0,
        seed: Optional[int] = 42,
        tensorboard_log: Optional[str] = None,
    ) -> Any:
        """Khởi tạo mô hình DRL theo cấu hình chuẩn FinRL."""
        name = model_name.lower()
        if name not in MODELS:
            raise ValueError(f"Mô hình '{model_name}' không tồn tại. Các lựa chọn: {list(MODELS.keys())}")

        if model_kwargs is None:
            model_kwargs = MODEL_KWARGS.get(name, {}).copy()
        else:
            model_kwargs = model_kwargs.copy()

        # Xử lý tham số noise nếu được chỉ định
        if "action_noise" in model_kwargs:
            noise_type = model_kwargs["action_noise"]
            if isinstance(noise_type, str) and noise_type in NOISE:
                n_actions = self.env.action_space.shape[-1]
                if noise_type == "normal":
                    model_kwargs["action_noise"] = NormalActionNoise(
                        mean=np.zeros(n_actions), sigma=0.1 * np.ones(n_actions)
                    )
                elif noise_type == "ornstein_uhlenbeck":
                    model_kwargs["action_noise"] = OrnsteinUhlenbeckActionNoise(
                        mean=np.zeros(n_actions), sigma=0.15 * np.ones(n_actions)
                    )

        # Tránh trùng lặp các tham số cốt lõi giữa kwargs và explicit args
        if "verbose" in model_kwargs:
            verbose = model_kwargs.pop("verbose")
        if "seed" in model_kwargs and seed is None:
            seed = model_kwargs.pop("seed")
        elif "seed" in model_kwargs:
            model_kwargs.pop("seed")
        if "tensorboard_log" in model_kwargs and tensorboard_log is None:
            tensorboard_log = model_kwargs.pop("tensorboard_log")
        elif "tensorboard_log" in model_kwargs:
            model_kwargs.pop("tensorboard_log")

        return MODELS[name](
            policy=policy,
            env=self.env,
            tensorboard_log=tensorboard_log,
            verbose=verbose,
            policy_kwargs=policy_kwargs,
            seed=seed,
            **model_kwargs,
        )

    @staticmethod
    def train_model(
        model: Any,
        tb_log_name: str = "drl_agent",
        total_timesteps: int = 5000,
        callbacks: Optional[Union[BaseCallback, List[BaseCallback]]] = None,
    ) -> Any:
        """Huấn luyện mô hình DRL với logging và callbacks."""
        cb_list = []
        if callbacks is None:
            cb_list = [TensorboardCallback()]
        elif isinstance(callbacks, list):
            cb_list = callbacks
        else:
            cb_list = [callbacks]

        model = model.learn(
            total_timesteps=total_timesteps,
            tb_log_name=tb_log_name,
            callback=CallbackList(cb_list),
        )
        return model

    @staticmethod
    def DRL_prediction(
        model: Any,
        environment: Any,
        deterministic: bool = True,
        num_games: int = 10,
    ) -> Dict[str, Any]:
        """
        Dự đoán và kiểm thử hiệu năng tác nhân DRL trên môi trường game.
        Tương thích API DRL_prediction của FinRL nhưng mở rộng cho Game.
        """
        if hasattr(environment, "get_sb_env"):
            eval_env, _ = environment.get_sb_env()
        elif hasattr(environment, "reset"):
            eval_env = environment
        else:
            eval_env = environment

        wins, losses, draws, invalids = 0, 0, 0, 0
        all_rewards: List[float] = []

        for _ in range(num_games):
            res_reset = eval_env.reset()
            obs = res_reset[0] if isinstance(res_reset, tuple) else res_reset
            done = False
            ep_reward = 0.0
            info = {}

            while not done:
                action, _ = model.predict(obs, deterministic=deterministic)
                step_res = eval_env.step(action)
                if len(step_res) == 5:
                    obs, reward, terminated, truncated, info = step_res
                    done = terminated or truncated
                else:
                    obs, reward, done, info = step_res
                
                # Trích xuất scalar từ mảng nếu dùng VecEnv
                if isinstance(reward, np.ndarray):
                    reward = float(reward[0])
                ep_reward += reward

            all_rewards.append(ep_reward)
            outcome = info.get("result", "draw") if isinstance(info, dict) else (info[0].get("result", "draw") if isinstance(info, list) and info else "draw")
            if outcome == "win":
                wins += 1
            elif outcome == "loss":
                losses += 1
            elif outcome == "invalid":
                invalids += 1
                losses += 1
            else:
                draws += 1

        win_rate = (wins / num_games) * 100
        invincible_rate = ((wins + draws) / num_games) * 100

        return {
            "num_games": num_games,
            "wins": wins,
            "draws": draws,
            "losses": losses,
            "invalids": invalids,
            "win_rate": win_rate,
            "invincible_rate": invincible_rate,
            "mean_reward": float(np.mean(all_rewards)),
        }

    @staticmethod
    def save_model(model: Any, path: str):
        """Lưu checkpoint mô hình."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        model.save(path)

    @staticmethod
    def load_model(model_name: str, path: str, env: Optional[Any] = None) -> Any:
        """Nạp checkpoint mô hình."""
        name = model_name.lower()
        if name not in MODELS:
            raise ValueError(f"Mô hình '{model_name}' không tồn tại trong danh mục.")
        return MODELS[name].load(path, env=env)


def plot_learning_curves(cb: GameMetricsCallback, model_name: str):
    """Vẽ 3 đồ thị: Training Loss, Q-Learning Value và Cumulative Rewards."""
    fig, axes = plt.subplots(1, 3, figsize=(16, 4.5))
    fig.suptitle(f"Đường Cong Huấn Luyện Mô Hình: {model_name.upper()} (FinRL DRLAgent)", fontsize=14, fontweight='bold')

    # 1. Loss
    axes[0].plot(cb.timesteps, cb.losses, color='#ef4444', lw=2, label='Training Loss')
    axes[0].set_title("1. Training Loss Curve")
    axes[0].set_xlabel("Timesteps")
    axes[0].set_ylabel("Loss Value")
    axes[0].grid(True, linestyle="--", alpha=0.5)
    axes[0].legend()

    # 2. Q-values
    axes[1].plot(cb.timesteps, cb.q_values, color='#0284c7', lw=2, label='Expected Q / Value')
    axes[1].set_title("2. Q-Learning Value tại các trạng thái t")
    axes[1].set_xlabel("Timesteps")
    axes[1].set_ylabel("Mean Q / Value")
    axes[1].grid(True, linestyle="--", alpha=0.5)
    axes[1].legend()

    # 3. Rewards
    if cb.ep_rewards:
        window = max(1, len(cb.ep_rewards) // 30)
        smoothed = np.convolve(cb.ep_rewards, np.ones(window)/window, mode='valid')
        axes[2].plot(smoothed, color='#16a34a', lw=2, label=f'Reward (MA {window})')
    axes[2].set_title("3. Episode Rewards Progression")
    axes[2].set_xlabel("Step Intervals")
    axes[2].set_ylabel("Average Reward")
    axes[2].grid(True, linestyle="--", alpha=0.5)
    axes[2].legend()

# Alias tương thích ngược với notebook
FinRLGameMetricsCallback = GameMetricsCallback
plot_model_curves = plot_learning_curves


def evaluate_trained_agent(model: Any, env: Any, num_games: int = 10, is_continuous: bool = False):
    """Kiểm thử mô hình đã huấn luyện thi đấu num_games ván và in kết quả chi tiết."""
    wins, losses, draws = 0, 0, 0
    print(f"\n🎮 BẮT ĐẦU KIỂM THỬ {num_games} VÁN ĐỐI ĐẦU MINIMAX AI:")

    for g in range(num_games):
        obs, _ = env.reset()
        done = False
        reward = 0.0
        info = {}
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

        res = info.get("result", "draw")
        if res == "win":
            wins += 1
            tag = "🏆 THẮNG"
        elif res == "loss":
            losses += 1
            tag = "❌ THUA"
        elif res == "invalid":
            losses += 1
            tag = "⚠️ PHẠM QUY"
        else:
            draws += 1
            tag = "🤝 HÒA"
        print(f"Ván {g+1:02d}: {tag} (Phần thưởng: {reward:+.2f})")

    print(f"\n📊 TỔNG KẾT: Thắng: {wins}/{num_games} | Hòa: {draws}/{num_games} | Thua: {losses}/{num_games}")
    print(f"Tỷ lệ bất bại: {(wins + draws) / num_games * 100:.1f}%")

