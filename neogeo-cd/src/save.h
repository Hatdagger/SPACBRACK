/*
 * SPACBRACK - records and options, kept in the Neo Geo CD's backup memory
 * (its built-in "memory card") through the BIOS CARD call.
 */
#ifndef TT_SAVE_H
#define TT_SAVE_H

#define REC_N 5                         /* places in each records table */

/* actions a pad button can do (remap) */
enum { ACT_ROT_L, ACT_ROT_R, ACT_HOLD, ACT_HARD, ACT_N };

typedef struct {
    BYTE das, arr;                      /* frames */
    BYTE sonic;                         /* soft drop goes straight down */
    BYTE btn[ACT_N];                    /* 0..3 = A B C D, 4 = none */
    BYTE up_drop;                       /* Up also hard drops */
} PadCfg;

extern char  mar_name[REC_N][4];        /* Marathon: score table */
extern DWORD mar_score[REC_N];
extern char  spr_name[REC_N][4];        /* Sprint: 40-line times in frames */
extern DWORD spr_time[REC_N];
extern char  srv_name[REC_N][4];        /* Survival: CPUs knocked out */
extern DWORD srv_kos[REC_N];
extern PadCfg pad_cfg[2];
extern BYTE  opt_ghost, opt_clear, opt_music;
extern BYTE  save_answer;               /* last BIOS answer: 0 fine, 0x80+ error */

void save_defaults_pad(PadCfg *c);
void save_load(void);                   /* at boot: read, or start with defaults */
void save_records(void);
void save_options(void);
int  mar_rank(DWORD score);             /* place 0..4 it would take, or -1 */
int  spr_rank(DWORD frames);
int  srv_rank(DWORD kos);
void mar_insert(int rank, const char *name, DWORD score);
void spr_insert(int rank, const char *name, DWORD frames);
void srv_insert(int rank, const char *name, DWORD kos);

#endif
