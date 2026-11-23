/* Stand-in for DATlib so main.c runs on a PC (see test/frontend.c). */
#ifndef STUB_DATLIB_H
#define STUB_DATLIB_H
typedef struct paletteInfo { ushort count; ushort data[256]; } paletteInfo;
typedef struct pictureInfo {
    ushort stripSize, tileWidth, tileHeight;
    const paletteInfo *palInfo;
    ushort *maps[4];
} pictureInfo;
typedef struct picture {
    ushort baseSprite, basePalette;
    short posX, posY;
    ushort currentFlip;
    const pictureInfo *info;
    int shown;
} picture;
extern ushort LSPCmode;
#define FLIP_NONE 0
#define SPR_LINK   0x0040
#define SPR_UNLINK 0x0000
#define YSHIFT 496
#define VRAM_SPR_ADDR(s)    ((s)<<6)
#define VRAM_SHRINK_ADDR(s) (0x8000|(s))
#define VRAM_POSY_ADDR(s)   (0x8200|(s))
#define VRAM_POSY(y,l,h)    (((YSHIFT-(y))<<7)|(l)|(h))
#define VRAM_POSX_ADDR(s)   (0x8400|(s))
#define VRAM_POSX(x)        ((x)<<7)
#define volMEMBYTE(a) (*((volatile BYTE *)(a)))
/* braced like the real DATlib macros, so "if (x) macro(); else" fails here too */
#define backgroundColor(c) {stub_bg(c);}
#define palJobPut(n,c,d) {stub_pal((n),(c),(d));}
#define SC234Put(a,d) {stub_vram((WORD)(a),(WORD)(d));}
void stub_bg(WORD c); void stub_pal(int n, int c, const void *d); void stub_vram(WORD a, WORD d);
void initGfx(void); void SCClose(void); void waitVBlank(void); void clearFixLayer(void);
void fixPrint(ushort x, ushort y, ushort pal, ushort bank, const char *buf);
void pictureInit(picture *p, const pictureInfo *pi, ushort bs, ushort bp, short x, short y, ushort f);
void pictureHide(picture *p); void pictureShow(picture *p);
#endif
