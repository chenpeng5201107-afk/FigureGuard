import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * 模块化引入：只注册需要的柱状图 / 散点图 / 折线图、直角坐标系与提示框、Canvas 渲染器，
 * 不引入额外的 React 图表封装库，产物里不打包用不到的图表类型（图例、数据集、坐标轴指示器均未注册）。
 * Day 9 增注册 TitleComponent：PNG 导出要把图表标题画进画布本身，页面里的 HTML 标题不会进 `getDataURL()`。
 */
echarts.use([BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer]);

export { echarts };
export type EChartsInstance = echarts.ECharts;
