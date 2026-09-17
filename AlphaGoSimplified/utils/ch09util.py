import numpy as np
from copy import deepcopy
from utils.ch08util import select, expand, backpropagate, next_move


def onehot_encoder(state):
    onehot = np.zeros((1, 22))
    onehot[0, state] = 1
    return onehot


def DL_stochastic(env, model=None):
    if model is None:
        # Fallback to global model if available
        import sys
        main_mod = sys.modules.get('__main__')
        model = getattr(main_mod, 'model', None)
        if model is None:
            raise ValueError("A trained model must be provided to DL_stochastic.")
    state = env.state
    onehot_state = onehot_encoder(state)
    action_probs = model(onehot_state)
    return np.random.choice([1, 2], p=np.squeeze(action_probs))


def policy_simulate(env_copy, done, reward, model):
    # if the game has already ended
    if done:
        return reward
    while True:
        move = DL_stochastic(env_copy, model)
        state, reward, done, info = env_copy.step(move)
        if done:
            return reward


def policy_mcts_coin(env, model, num_rollouts=100, temperature=1.4):
    # if there is only one valid move left, take it
    if len(env.validinputs) == 1:
        return env.validinputs[0]
    # create three dictionaries counts, wins, losses
    counts = {}
    wins = {}
    losses = {}
    for move in env.validinputs:
        counts[move] = 0
        wins[move] = 0
        losses[move] = 0
    # roll out games
    for _ in range(num_rollouts):
        # selection
        move = select(env, counts, wins, losses, temperature)
        # expansion
        env_copy, done, reward = expand(env, move)
        # simulation
        reward = policy_simulate(env_copy, done, reward, model)
        # backpropagate
        counts, wins, losses = backpropagate(
            env, move, reward, counts, wins, losses)
    # make the move
    return next_move(counts, wins, losses)

