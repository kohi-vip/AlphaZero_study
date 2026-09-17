import numpy as np
from copy import deepcopy
from utils.ch08util import backpropagate, expand, simulate

gamma = 10


def mix_select(env, ps, counts, wins, losses, temperature):
    # a dictionary of mixed scores for all next moves
    scores = {}
    # the ones not visited get the priority
    for k in env.validinputs:
        if counts[k] == 0:
            return k
    # total number of simulations conducted
    N = sum([v for k, v in counts.items()])
    # calculate scores
    for k, v in counts.items():
        # the third term based on policy network
        weighted_pi = gamma * ps[k] / (1 + counts[k])
        if v == 0:
            scores[k] = weighted_pi
        else:
            # vi for each next move
            vi = (wins.get(k, 0) - losses.get(k, 0)) / v
            # exploration term
            exploration = temperature * np.sqrt(np.log(N) / counts[k])
            # mixed score
            scores[k] = vi + exploration + weighted_pi
    # Select the next move with the highest UCT score
    return max(scores, key=scores.get)


def next_move(ps, counts, wins, losses):
    # See which action is most promising
    scores = {}
    # calculate scores
    for k, v in counts.items():
        # the third term based on policy network
        weighted_pi = gamma * ps[k] / (1 + counts[k])
        # vi for each next move
        vi = (wins.get(k, 0) - losses.get(k, 0)) / v
        # mixed score
        scores[k] = vi + weighted_pi
    # Select the next move with the score
    return max(scores, key=scores.get)


def mix_mcts_conn(env, model, num_rollouts=100, temperature=1.4):
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
    # priors from the policy network
    state = env.state.reshape(-1, 7, 6, 1)
    if env.turn == "red":
        action_probs = model(state)
    else:
        action_probs = model(-state)
    ps = {}
    for a in sorted(env.validinputs):
        ps[a] = np.squeeze(action_probs)[a - 1]
    # roll out games
    for _ in range(num_rollouts):
        # selection
        move = mix_select(env, ps, counts, wins, losses, temperature)
        # expansion
        env_copy, done, reward = expand(env, move)
        # simulation
        reward = simulate(env_copy, done, reward)
        # backpropagate
        counts, wins, losses = backpropagate(
            env, move, reward, counts, wins, losses)
    # make the move
    return next_move(ps, counts, wins, losses)

