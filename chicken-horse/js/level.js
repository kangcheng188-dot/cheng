/* 主机架 Mainframe —— 地图数据 */
'use strict';
(function (U) {
  const { W, H } = U.C;

  // 材质编号（solid 网格里的值）
  const M = {
    EMPTY: 0,
    METAL: 1,     // 机柜地形
    CHIP: 2,      // 中央 CPU 芯片平台
    WOOD: 3,
    ICE: 4,
    HONEY: 5,
    CONVEYOR: 6,
    SPRING: 7,
    SPIKE: 8,
    DEVICE: 9,    // 弩 / 喷火器机身
    CIRCUIT: 10,  // 电路板实体格
  };

  function buildMainframe() {
    const terrain = new Uint8Array(W * H);
    const set = (x0, y0, x1, y1, m) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x >= 0 && x < W && y >= 0 && y < H) terrain[y * W + x] = m;
    };
    // 起点机柜 & 终点机柜
    set(0, 16, 9, H, M.METAL);
    set(37, 16, W, H, M.METAL);
    // 中央悬浮 CPU 芯片
    set(21, 15, 25, 16, M.CHIP);
    set(22, 16, 24, 17, M.CHIP);

    return {
      name: '主机架',
      nameEn: 'MAINFRAME',
      terrain,
      spawns: [
        { x: 2.3, y: 16 },
        { x: 3.6, y: 16 },
        { x: 4.9, y: 16 },
        { x: 6.2, y: 16 },
      ],
      spawnZone: { x0: 1, y0: 13, x1: 8, y1: 16 },
      goal: { x: 42.5, y: 16, x0: 41.6, y0: 12.4, x1: 43.4, y1: 16 },
      goalZone: { x0: 40, y0: 11, x1: 45, y1: 16 },
      boards: [
        { x0: 10, y0: 6, x1: 20, y1: 15 },
        { x0: 26, y0: 6, x1: 36, y1: 15 },
      ],
      killY: H + 1.5,
      ceilingY: -8,
    };
  }

  U.M = M;
  U.Level = { buildMainframe };
})(window.UCH);
