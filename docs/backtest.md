# Backtest results

Generated 2026-09-27T23:46:06.588Z by `npm run backtest`. Chronological by tournament: each target tournament is predicted from a snapshot dated the Sunday strictly before its start date. Pairwise accuracy counts correctly ordered pairs among entrants every model could rate; ties in prediction count one half.

Splits: **validation** = targets starting 2024-12-01 to 2026-01-31 (used for any parameter choice); **test** = targets starting 2026-02-01 or later (held out; reported once for the defaults).

## B · Team Performance · validation

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7351 | 823619 |
| v2-default | event_mean_spearman | 0.5299 | 3653 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7277 | 823619 |
| placement-logit-baseline | event_mean_spearman | 0.5145 | 3653 |
| v1-elo | event_pairwise_accuracy | 0.6809 | 823619 |
| v1-elo | event_mean_spearman | 0.4242 | 3653 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7351 | 823619 |
| v2-online-weight-1 | event_mean_spearman | 0.5299 | 3653 |
| v2-decay-100 | event_pairwise_accuracy | 0.7354 | 823619 |
| v2-decay-100 | event_mean_spearman | 0.5308 | 3653 |
| v2-decay-400 | event_pairwise_accuracy | 0.7348 | 823619 |
| v2-decay-400 | event_mean_spearman | 0.5309 | 3653 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7353 | 823619 |
| v2-fieldsize-0 | event_mean_spearman | 0.5331 | 3653 |
| v2-window-300 | event_pairwise_accuracy | 0.7351 | 823619 |
| v2-window-300 | event_mean_spearman | 0.5299 | 3653 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7361 | 823619 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5342 | 3653 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7331 | 823619 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.5264 | 3653 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7347 | 823619 |
| v2-lambdaK-3 | event_mean_spearman | 0.5281 | 3653 |
| v2-default | overall_pairwise_accuracy | 0.7551 | 68945 |
| v2-default | overall_mean_spearman | 0.5908 | 182 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7479 | 68945 |
| placement-logit-baseline | overall_mean_spearman | 0.5650 | 184 |
| v1-elo | overall_pairwise_accuracy | 0.7810 | 68945 |
| v1-elo | overall_mean_spearman | 0.6889 | 184 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.7551 | 68945 |
| v2-online-weight-1 | overall_mean_spearman | 0.5908 | 182 |
| v2-decay-100 | overall_pairwise_accuracy | 0.7554 | 68945 |
| v2-decay-100 | overall_mean_spearman | 0.5926 | 182 |
| v2-decay-400 | overall_pairwise_accuracy | 0.7545 | 68945 |
| v2-decay-400 | overall_mean_spearman | 0.5912 | 182 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.7554 | 68945 |
| v2-fieldsize-0 | overall_mean_spearman | 0.5982 | 182 |
| v2-window-300 | overall_pairwise_accuracy | 0.7551 | 68945 |
| v2-window-300 | overall_mean_spearman | 0.5908 | 182 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.7583 | 68945 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.6059 | 182 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.7516 | 68945 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.5863 | 182 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.7545 | 68945 |
| v2-lambdaK-3 | overall_mean_spearman | 0.5869 | 182 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.7114 | 301241 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.6941 | 5014 |
| coverage | target_tournaments | 255.0000 | 255 (0 explicitly online targets) |

## B · Team Performance · test

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7268 | 232874 |
| v2-default | event_mean_spearman | 0.5274 | 2036 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7161 | 232874 |
| placement-logit-baseline | event_mean_spearman | 0.5076 | 2036 |
| v1-elo | event_pairwise_accuracy | 0.6552 | 232874 |
| v1-elo | event_mean_spearman | 0.3987 | 2036 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7268 | 232874 |
| v2-online-weight-1 | event_mean_spearman | 0.5274 | 2036 |
| v2-decay-100 | event_pairwise_accuracy | 0.7275 | 232874 |
| v2-decay-100 | event_mean_spearman | 0.5305 | 2036 |
| v2-decay-400 | event_pairwise_accuracy | 0.7260 | 232874 |
| v2-decay-400 | event_mean_spearman | 0.5249 | 2036 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7270 | 232874 |
| v2-fieldsize-0 | event_mean_spearman | 0.5311 | 2036 |
| v2-window-300 | event_pairwise_accuracy | 0.7268 | 232874 |
| v2-window-300 | event_mean_spearman | 0.5274 | 2036 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7281 | 232874 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5328 | 2036 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7242 | 232874 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.5225 | 2036 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7262 | 232874 |
| v2-lambdaK-3 | event_mean_spearman | 0.5260 | 2036 |
| v2-default | overall_pairwise_accuracy | 0.7700 | 16002 |
| v2-default | overall_mean_spearman | 0.5555 | 101 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7534 | 16002 |
| placement-logit-baseline | overall_mean_spearman | 0.5549 | 101 |
| v1-elo | overall_pairwise_accuracy | 0.7611 | 16002 |
| v1-elo | overall_mean_spearman | 0.6479 | 101 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.7700 | 16002 |
| v2-online-weight-1 | overall_mean_spearman | 0.5555 | 101 |
| v2-decay-100 | overall_pairwise_accuracy | 0.7708 | 16002 |
| v2-decay-100 | overall_mean_spearman | 0.5628 | 101 |
| v2-decay-400 | overall_pairwise_accuracy | 0.7677 | 16002 |
| v2-decay-400 | overall_mean_spearman | 0.5580 | 101 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.7700 | 16002 |
| v2-fieldsize-0 | overall_mean_spearman | 0.5599 | 101 |
| v2-window-300 | overall_pairwise_accuracy | 0.7700 | 16002 |
| v2-window-300 | overall_mean_spearman | 0.5555 | 101 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.7741 | 16002 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.5749 | 101 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.7634 | 16002 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.5427 | 101 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.7691 | 16002 |
| v2-lambdaK-3 | overall_mean_spearman | 0.5561 | 101 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.7061 | 107044 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.6800 | 5632 |
| coverage | target_tournaments | 146.0000 | 146 (0 explicitly online targets) |

## B · School Potential · validation

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7504 | 562726 |
| v2-default | event_mean_spearman | 0.5930 | 4229 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7187 | 562726 |
| placement-logit-baseline | event_mean_spearman | 0.5528 | 4229 |
| v1-elo | event_pairwise_accuracy | 0.7076 | 562726 |
| v1-elo | event_mean_spearman | 0.5057 | 4229 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7504 | 562726 |
| v2-online-weight-1 | event_mean_spearman | 0.5930 | 4229 |
| v2-decay-100 | event_pairwise_accuracy | 0.7488 | 562726 |
| v2-decay-100 | event_mean_spearman | 0.5891 | 4229 |
| v2-decay-400 | event_pairwise_accuracy | 0.7488 | 562726 |
| v2-decay-400 | event_mean_spearman | 0.5926 | 4229 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7496 | 562726 |
| v2-fieldsize-0 | event_mean_spearman | 0.5934 | 4229 |
| v2-window-300 | event_pairwise_accuracy | 0.7492 | 540788 |
| v2-window-300 | event_mean_spearman | 0.5927 | 4197 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7506 | 562726 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5962 | 4229 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7490 | 562726 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.5893 | 4229 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7476 | 562726 |
| v2-lambdaK-3 | event_mean_spearman | 0.5884 | 4229 |
| v2-default | overall_pairwise_accuracy | 0.8309 | 39629 |
| v2-default | overall_mean_spearman | 0.7573 | 205 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7830 | 39629 |
| placement-logit-baseline | overall_mean_spearman | 0.6611 | 206 |
| v1-elo | overall_pairwise_accuracy | 0.7991 | 39629 |
| v1-elo | overall_mean_spearman | 0.7267 | 206 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.8309 | 39629 |
| v2-online-weight-1 | overall_mean_spearman | 0.7573 | 205 |
| v2-decay-100 | overall_pairwise_accuracy | 0.8264 | 39629 |
| v2-decay-100 | overall_mean_spearman | 0.7444 | 205 |
| v2-decay-400 | overall_pairwise_accuracy | 0.8310 | 39629 |
| v2-decay-400 | overall_mean_spearman | 0.7584 | 205 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.8301 | 39629 |
| v2-fieldsize-0 | overall_mean_spearman | 0.7616 | 205 |
| v2-window-300 | overall_pairwise_accuracy | 0.8277 | 37218 |
| v2-window-300 | overall_mean_spearman | 0.7528 | 202 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.8327 | 39629 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.7606 | 205 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.8260 | 39629 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.7419 | 205 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.8248 | 39629 |
| v2-lambdaK-3 | overall_mean_spearman | 0.7445 | 205 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.6957 | 80060 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.6931 | 3449 |
| coverage | target_tournaments | 255.0000 | 255 (0 explicitly online targets) |

## B · School Potential · test

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7465 | 303929 |
| v2-default | event_mean_spearman | 0.5717 | 2710 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7108 | 303929 |
| placement-logit-baseline | event_mean_spearman | 0.5263 | 2710 |
| v1-elo | event_pairwise_accuracy | 0.7034 | 303929 |
| v1-elo | event_mean_spearman | 0.4894 | 2710 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7465 | 303929 |
| v2-online-weight-1 | event_mean_spearman | 0.5717 | 2710 |
| v2-decay-100 | event_pairwise_accuracy | 0.7405 | 303929 |
| v2-decay-100 | event_mean_spearman | 0.5565 | 2710 |
| v2-decay-400 | event_pairwise_accuracy | 0.7483 | 303929 |
| v2-decay-400 | event_mean_spearman | 0.5779 | 2710 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7463 | 303929 |
| v2-fieldsize-0 | event_mean_spearman | 0.5776 | 2710 |
| v2-window-300 | event_pairwise_accuracy | 0.7522 | 250916 |
| v2-window-300 | event_mean_spearman | 0.6289 | 2360 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7472 | 303929 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5787 | 2710 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7448 | 303929 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.5667 | 2710 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7422 | 303929 |
| v2-lambdaK-3 | event_mean_spearman | 0.5658 | 2710 |
| v2-default | overall_pairwise_accuracy | 0.8182 | 19523 |
| v2-default | overall_mean_spearman | 0.6433 | 138 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7549 | 19523 |
| placement-logit-baseline | overall_mean_spearman | 0.5285 | 139 |
| v1-elo | overall_pairwise_accuracy | 0.7978 | 19523 |
| v1-elo | overall_mean_spearman | 0.6485 | 139 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.8182 | 19523 |
| v2-online-weight-1 | overall_mean_spearman | 0.6433 | 138 |
| v2-decay-100 | overall_pairwise_accuracy | 0.8047 | 19523 |
| v2-decay-100 | overall_mean_spearman | 0.6066 | 138 |
| v2-decay-400 | overall_pairwise_accuracy | 0.8221 | 19523 |
| v2-decay-400 | overall_mean_spearman | 0.6530 | 138 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.8192 | 19523 |
| v2-fieldsize-0 | overall_mean_spearman | 0.6563 | 138 |
| v2-window-300 | overall_pairwise_accuracy | 0.8368 | 14082 |
| v2-window-300 | overall_mean_spearman | 0.7884 | 114 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.8222 | 19523 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.6551 | 138 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.8100 | 19523 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.6173 | 138 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.8071 | 19523 |
| v2-lambdaK-3 | overall_mean_spearman | 0.6141 | 138 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.6568 | 53914 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.6536 | 1813 |
| coverage | target_tournaments | 146.0000 | 146 (0 explicitly online targets) |

## C · Team Performance · validation

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7132 | 811099 |
| v2-default | event_mean_spearman | 0.4975 | 5173 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7077 | 811099 |
| placement-logit-baseline | event_mean_spearman | 0.4888 | 5173 |
| v1-elo | event_pairwise_accuracy | 0.6751 | 811099 |
| v1-elo | event_mean_spearman | 0.4185 | 5173 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7132 | 811099 |
| v2-online-weight-1 | event_mean_spearman | 0.4975 | 5173 |
| v2-decay-100 | event_pairwise_accuracy | 0.7132 | 811099 |
| v2-decay-100 | event_mean_spearman | 0.4970 | 5173 |
| v2-decay-400 | event_pairwise_accuracy | 0.7129 | 811099 |
| v2-decay-400 | event_mean_spearman | 0.4970 | 5173 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7131 | 811099 |
| v2-fieldsize-0 | event_mean_spearman | 0.4986 | 5173 |
| v2-window-300 | event_pairwise_accuracy | 0.7132 | 811099 |
| v2-window-300 | event_mean_spearman | 0.4975 | 5173 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7147 | 811099 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5013 | 5173 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7110 | 811099 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.4933 | 5173 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7130 | 811099 |
| v2-lambdaK-3 | event_mean_spearman | 0.4968 | 5173 |
| v2-default | overall_pairwise_accuracy | 0.7523 | 67155 |
| v2-default | overall_mean_spearman | 0.6251 | 259 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7492 | 67155 |
| placement-logit-baseline | overall_mean_spearman | 0.6216 | 260 |
| v1-elo | overall_pairwise_accuracy | 0.7737 | 67155 |
| v1-elo | overall_mean_spearman | 0.7036 | 260 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.7523 | 67155 |
| v2-online-weight-1 | overall_mean_spearman | 0.6251 | 259 |
| v2-decay-100 | overall_pairwise_accuracy | 0.7529 | 67155 |
| v2-decay-100 | overall_mean_spearman | 0.6247 | 259 |
| v2-decay-400 | overall_pairwise_accuracy | 0.7525 | 67155 |
| v2-decay-400 | overall_mean_spearman | 0.6258 | 259 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.7541 | 67155 |
| v2-fieldsize-0 | overall_mean_spearman | 0.6294 | 259 |
| v2-window-300 | overall_pairwise_accuracy | 0.7523 | 67155 |
| v2-window-300 | overall_mean_spearman | 0.6251 | 259 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.7562 | 67155 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.6315 | 259 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.7483 | 67155 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.6173 | 259 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.7521 | 67155 |
| v2-lambdaK-3 | overall_mean_spearman | 0.6244 | 259 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.7067 | 498811 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.6895 | 7803 |
| coverage | target_tournaments | 330.0000 | 330 (0 explicitly online targets) |

## C · Team Performance · test

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7276 | 358937 |
| v2-default | event_mean_spearman | 0.5269 | 2677 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7156 | 358937 |
| placement-logit-baseline | event_mean_spearman | 0.5094 | 2677 |
| v1-elo | event_pairwise_accuracy | 0.6766 | 358937 |
| v1-elo | event_mean_spearman | 0.4158 | 2677 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7276 | 358937 |
| v2-online-weight-1 | event_mean_spearman | 0.5269 | 2677 |
| v2-decay-100 | event_pairwise_accuracy | 0.7272 | 358937 |
| v2-decay-100 | event_mean_spearman | 0.5268 | 2677 |
| v2-decay-400 | event_pairwise_accuracy | 0.7278 | 358937 |
| v2-decay-400 | event_mean_spearman | 0.5272 | 2677 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7275 | 358937 |
| v2-fieldsize-0 | event_mean_spearman | 0.5284 | 2677 |
| v2-window-300 | event_pairwise_accuracy | 0.7276 | 358937 |
| v2-window-300 | event_mean_spearman | 0.5269 | 2677 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7300 | 358937 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5322 | 2677 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7253 | 358937 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.5197 | 2677 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7271 | 358937 |
| v2-lambdaK-3 | event_mean_spearman | 0.5260 | 2677 |
| v2-default | overall_pairwise_accuracy | 0.7739 | 25342 |
| v2-default | overall_mean_spearman | 0.6091 | 136 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7578 | 25342 |
| placement-logit-baseline | overall_mean_spearman | 0.5499 | 138 |
| v1-elo | overall_pairwise_accuracy | 0.7721 | 25342 |
| v1-elo | overall_mean_spearman | 0.6653 | 138 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.7739 | 25342 |
| v2-online-weight-1 | overall_mean_spearman | 0.6091 | 136 |
| v2-decay-100 | overall_pairwise_accuracy | 0.7716 | 25342 |
| v2-decay-100 | overall_mean_spearman | 0.5959 | 136 |
| v2-decay-400 | overall_pairwise_accuracy | 0.7738 | 25342 |
| v2-decay-400 | overall_mean_spearman | 0.6076 | 136 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.7739 | 25342 |
| v2-fieldsize-0 | overall_mean_spearman | 0.6084 | 136 |
| v2-window-300 | overall_pairwise_accuracy | 0.7739 | 25342 |
| v2-window-300 | overall_mean_spearman | 0.6091 | 136 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.7799 | 25342 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.6262 | 136 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.7666 | 25342 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.5792 | 136 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.7720 | 25342 |
| v2-lambdaK-3 | overall_mean_spearman | 0.6036 | 136 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.7092 | 149957 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.6649 | 2866 |
| coverage | target_tournaments | 167.0000 | 167 (0 explicitly online targets) |

## C · School Potential · validation

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7462 | 1079177 |
| v2-default | event_mean_spearman | 0.5901 | 6083 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7238 | 1079177 |
| placement-logit-baseline | event_mean_spearman | 0.5629 | 6083 |
| v1-elo | event_pairwise_accuracy | 0.7079 | 1079177 |
| v1-elo | event_mean_spearman | 0.5018 | 6083 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7462 | 1079177 |
| v2-online-weight-1 | event_mean_spearman | 0.5901 | 6083 |
| v2-decay-100 | event_pairwise_accuracy | 0.7420 | 1079177 |
| v2-decay-100 | event_mean_spearman | 0.5829 | 6083 |
| v2-decay-400 | event_pairwise_accuracy | 0.7462 | 1079177 |
| v2-decay-400 | event_mean_spearman | 0.5901 | 6083 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7453 | 1079177 |
| v2-fieldsize-0 | event_mean_spearman | 0.5907 | 6083 |
| v2-window-300 | event_pairwise_accuracy | 0.7398 | 1007307 |
| v2-window-300 | event_mean_spearman | 0.5850 | 6013 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7469 | 1079177 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5922 | 6083 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7443 | 1079177 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.5847 | 6083 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7446 | 1079177 |
| v2-lambdaK-3 | event_mean_spearman | 0.5878 | 6083 |
| v2-default | overall_pairwise_accuracy | 0.8361 | 82163 |
| v2-default | overall_mean_spearman | 0.7912 | 295 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7978 | 82163 |
| placement-logit-baseline | overall_mean_spearman | 0.7361 | 295 |
| v1-elo | overall_pairwise_accuracy | 0.8115 | 82163 |
| v1-elo | overall_mean_spearman | 0.7817 | 295 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.8361 | 82163 |
| v2-online-weight-1 | overall_mean_spearman | 0.7912 | 295 |
| v2-decay-100 | overall_pairwise_accuracy | 0.8299 | 82163 |
| v2-decay-100 | overall_mean_spearman | 0.7818 | 295 |
| v2-decay-400 | overall_pairwise_accuracy | 0.8377 | 82163 |
| v2-decay-400 | overall_mean_spearman | 0.7960 | 295 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.8350 | 82163 |
| v2-fieldsize-0 | overall_mean_spearman | 0.7871 | 295 |
| v2-window-300 | overall_pairwise_accuracy | 0.8289 | 74730 |
| v2-window-300 | overall_mean_spearman | 0.7931 | 291 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.8397 | 82163 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.7978 | 295 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.8304 | 82163 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.7774 | 295 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.8329 | 82163 |
| v2-lambdaK-3 | overall_mean_spearman | 0.7815 | 295 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.7047 | 167886 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.6869 | 2047 |
| coverage | target_tournaments | 330.0000 | 330 (0 explicitly online targets) |

## C · School Potential · test

| model | metric | value | n |
|---|---|---|---|
| v2-default | event_pairwise_accuracy | 0.7573 | 543855 |
| v2-default | event_mean_spearman | 0.5877 | 3336 |
| placement-logit-baseline | event_pairwise_accuracy | 0.7294 | 543855 |
| placement-logit-baseline | event_mean_spearman | 0.5523 | 3336 |
| v1-elo | event_pairwise_accuracy | 0.7169 | 543855 |
| v1-elo | event_mean_spearman | 0.4944 | 3336 |
| v2-online-weight-1 | event_pairwise_accuracy | 0.7573 | 543855 |
| v2-online-weight-1 | event_mean_spearman | 0.5877 | 3336 |
| v2-decay-100 | event_pairwise_accuracy | 0.7505 | 543855 |
| v2-decay-100 | event_mean_spearman | 0.5682 | 3336 |
| v2-decay-400 | event_pairwise_accuracy | 0.7594 | 543855 |
| v2-decay-400 | event_mean_spearman | 0.5952 | 3336 |
| v2-fieldsize-0 | event_pairwise_accuracy | 0.7572 | 543855 |
| v2-fieldsize-0 | event_mean_spearman | 0.5913 | 3336 |
| v2-window-300 | event_pairwise_accuracy | 0.7609 | 452694 |
| v2-window-300 | event_mean_spearman | 0.6178 | 3025 |
| v2-lambdaS-0.5 | event_pairwise_accuracy | 0.7584 | 543855 |
| v2-lambdaS-0.5 | event_mean_spearman | 0.5947 | 3336 |
| v2-lambdaS-2 (v2-exp.1) | event_pairwise_accuracy | 0.7550 | 543855 |
| v2-lambdaS-2 (v2-exp.1) | event_mean_spearman | 0.5782 | 3336 |
| v2-lambdaK-3 | event_pairwise_accuracy | 0.7546 | 543855 |
| v2-lambdaK-3 | event_mean_spearman | 0.5802 | 3336 |
| v2-default | overall_pairwise_accuracy | 0.8215 | 36933 |
| v2-default | overall_mean_spearman | 0.7082 | 165 |
| placement-logit-baseline | overall_pairwise_accuracy | 0.7673 | 36933 |
| placement-logit-baseline | overall_mean_spearman | 0.5867 | 166 |
| v1-elo | overall_pairwise_accuracy | 0.8171 | 36933 |
| v1-elo | overall_mean_spearman | 0.6926 | 166 |
| v2-online-weight-1 | overall_pairwise_accuracy | 0.8215 | 36933 |
| v2-online-weight-1 | overall_mean_spearman | 0.7082 | 165 |
| v2-decay-100 | overall_pairwise_accuracy | 0.8096 | 36933 |
| v2-decay-100 | overall_mean_spearman | 0.6773 | 165 |
| v2-decay-400 | overall_pairwise_accuracy | 0.8285 | 36933 |
| v2-decay-400 | overall_mean_spearman | 0.7288 | 165 |
| v2-fieldsize-0 | overall_pairwise_accuracy | 0.8225 | 36933 |
| v2-fieldsize-0 | overall_mean_spearman | 0.7188 | 165 |
| v2-window-300 | overall_pairwise_accuracy | 0.8469 | 26133 |
| v2-window-300 | overall_mean_spearman | 0.7888 | 144 |
| v2-lambdaS-0.5 | overall_pairwise_accuracy | 0.8268 | 36933 |
| v2-lambdaS-0.5 | overall_mean_spearman | 0.7272 | 165 |
| v2-lambdaS-2 (v2-exp.1) | overall_pairwise_accuracy | 0.8156 | 36933 |
| v2-lambdaS-2 (v2-exp.1) | overall_mean_spearman | 0.6921 | 165 |
| v2-lambdaK-3 | overall_pairwise_accuracy | 0.8145 | 36933 |
| v2-lambdaK-3 | overall_mean_spearman | 0.6922 | 165 |
| v2-default | event_pairwise_accuracy[sparse(<=2 prior tournaments)] | 0.6564 | 62323 |
| v2-default | event_pairwise_accuracy[outside-reference-component] | 0.7105 | 791 |
| coverage | target_tournaments | 167.0000 | 167 (0 explicitly online targets) |

## B · School Potential · external

| model | metric | value | n |
|---|---|---|---|
| sentienttree | matched_schools | 353.0000 | 1767 (scly.io School Potential established ranks as of 2026-05-24 vs SentientTree 'Div B FINAL' (as-of date unknown)) |
| sentienttree | rank_spearman_matched | 0.9258 | 353 (scly.io School Potential established ranks as of 2026-05-24 vs SentientTree 'Div B FINAL' (as-of date unknown)) |
| sentienttree | top25_overlap | 20.0000 | 25 (scly.io School Potential established ranks as of 2026-05-24 vs SentientTree 'Div B FINAL' (as-of date unknown)) |

## C · School Potential · external

| model | metric | value | n |
|---|---|---|---|
| sentienttree | matched_schools | 539.0000 | 2539 (scly.io School Potential established ranks as of 2026-05-24 vs SentientTree 'Div C FINAL' (as-of date unknown)) |
| sentienttree | rank_spearman_matched | 0.9664 | 539 (scly.io School Potential established ranks as of 2026-05-24 vs SentientTree 'Div C FINAL' (as-of date unknown)) |
| sentienttree | top25_overlap | 22.0000 | 25 (scly.io School Potential established ranks as of 2026-05-24 vs SentientTree 'Div C FINAL' (as-of date unknown)) |
