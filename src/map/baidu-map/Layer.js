/**
 * @author kyle / http://nikai.us/
 */

import BaseLayer from "../BaseLayer";
import CanvasLayer from "./CanvasLayer";
import clear from "../../canvas/clear";
import DataSet from "../../data/DataSet";
import TWEEN from "../../utils/Tween";

class Layer extends BaseLayer{

    constructor(map, dataSet, options) {

        super(map, dataSet, options);

        var self = this;
        var data = null;
        options = options || {};

        this.clickEvent = this.clickEvent.bind(this);
        this.mousemoveEvent = this.mousemoveEvent.bind(this);

        self.init(options);
        self.argCheck(options);
        self.transferToMercator();

        var canvasLayer = this.canvasLayer = new CanvasLayer({
            map: map,
            context: this.context,
            paneName: options.paneName,
            mixBlendMode: options.mixBlendMode,
            enableMassClear: options.enableMassClear,
            zIndex: options.zIndex,
            update: function() {
                self._canvasUpdate();
            }
        });

        dataSet.on('change', function() {
            self.transferToMercator();
            canvasLayer.draw();
        });

    }

    clickEvent(e) {
        var pixel = e.pixel;
        super.clickEvent(pixel, e);
    }

    mousemoveEvent(e) {
        var pixel = e.pixel;
        super.mousemoveEvent(pixel, e);
    }

    bindEvent(e) {
        this.unbindEvent();
        var map = this.map;

        if (this.options.methods) {
            if (this.options.methods.click) {
                map.setDefaultCursor("default");
                map.addEventListener('click', this.clickEvent);
            }
            if (this.options.methods.mousemove) {
                map.addEventListener('mousemove', this.mousemoveEvent);
            }
        }
    }

    unbindEvent(e) {
        var map = this.map;

        if (this.options.methods) {
            if (this.options.methods.click) {
                map.removeEventListener('click', this.clickEvent);
            }
            if (this.options.methods.mousemove) {
                map.removeEventListener('mousemove', this.mousemoveEvent);
            }
        }
    }

    // 经纬度左边转换为墨卡托坐标
    transferToMercator() {
        var projection = this.map.getMapType().getProjection();

        if (this.options.coordType !== 'bd09mc') {
            var data = this.dataSet.get();
            data = this.dataSet.transferCoordinate(data, function(coordinates) {
                if (coordinates[0] < -180 || coordinates[0] > 180 || coordinates[1] < -90 || coordinates[1] > 90) {
                    return coordinates;
                } else {
                    var pixel = projection.lngLatToPoint({
                        lng: coordinates[0],
                        lat: coordinates[1]
                    });
                    return [pixel.x, pixel.y];
                }
            }, 'coordinates', 'coordinates_mercator');
            this.dataSet._set(data);
        }
    }

    getContext() {
        return this.canvasLayer.canvas.getContext(this.context);
    }

    _canvasUpdate(time) {
        if (!this.canvasLayer) {
            return;
        }

        var self = this;
        
        // 动画配置项 options.animation
        var animationOptions = self.options.animation;
        
        // map 对象
        var map = this.canvasLayer._map;
        
        // 当前比例尺和投影对象
        var zoomUnit = Math.pow(2, 18 - map.getZoom());
        var projection = map.getMapType().getProjection();
        
        // 墨卡托平面左上角坐标
        var mcCenter = projection.lngLatToPoint(map.getCenter());
        var nwMc = new BMap.Pixel(mcCenter.x - (map.getSize().width / 2) * zoomUnit, mcCenter.y + (map.getSize().height / 2) * zoomUnit); //左上角墨卡托坐标

        var context = this.getContext();
        
        // 是否开启了动画
        if (self.isEnabledTime()) {
            // 如果时间不存在，清空画布并退出
            if (time === undefined) {
                clear(context);
                return;
            }
            // 加尾迹效果
            if (this.context == '2d') {
                context.save();
                context.globalCompositeOperation = 'destination-out';
                context.fillStyle = 'rgba(0, 0, 0, .1)';
                context.fillRect(0, 0, context.canvas.width, context.canvas.height);
                context.restore();
            }
        } else {
            clear(context);
        }

        if (this.context == '2d') {
            // 如果是2d渲染，将配置项的属性设置到 canvas 的上下文
            for (var key in self.options) {
                context[key] = self.options[key];
            }
        } else {
            context.clear(context.COLOR_BUFFER_BIT);
        }
        
        // 如果地图级别超出范围，退出
        if (self.options.minZoom && map.getZoom() < self.options.minZoom || self.options.maxZoom && map.getZoom() > self.options.maxZoom) {
            return;
        }

        var scale = 1;
        if (this.context != '2d') {
            scale = this.canvasLayer.devicePixelRatio;
        }

        var dataGetOptions = {
            fromColumn: self.options.coordType == 'bd09mc' ? 'coordinates' : 'coordinates_mercator',
            transferCoordinate: function(coordinate) {
                var x = (coordinate[0] - nwMc.x) / zoomUnit * scale;
                var y = (nwMc.y - coordinate[1]) / zoomUnit * scale;
                return [x, y];
            }
        }

        if (time !== undefined) {
            dataGetOptions.filter = function(item) {
                var trails = animationOptions.trails || 10;
                if (time && item.time > (time - trails) && item.time < time) {
                    return true;
                } else {
                    return false;
                }
            }
        }

        // get data from data set
        var data = self.dataSet.get(dataGetOptions);

        this.processData(data);

        var nwPixel = map.pointToPixel(new BMap.Point(0, 0));

        if (self.options.unit == 'm') {
            if (self.options.size) {
                self.options._size = self.options.size / zoomUnit;
            }
            if (self.options.width) {
                self.options._width = self.options.width / zoomUnit;
            }
            if (self.options.height) {
                self.options._height = self.options.height / zoomUnit;
            }
        } else {
            self.options._size = self.options.size;
            self.options._height = self.options.height;
            self.options._width = self.options.width;
        }

        this.drawContext(context, data, self.options, nwPixel);

        //console.timeEnd('draw');

        //console.timeEnd('update')
        self.options.updateCallback && self.options.updateCallback(time);
    }

    init(options) {

        var self = this;
        self.options = options;
        this.initDataRange(options);
        this.context = self.options.context || '2d';

        if (self.options.zIndex) {
            this.canvasLayer && this.canvasLayer.setZIndex(self.options.zIndex);
        }

        if (self.options.max) {
            this.intensity.setMax(self.options.max);
        }

        if (self.options.min) {
            this.intensity.setMin(self.options.min);
        }

        this.initAnimator();
        this.bindEvent();
        
    }

    addAnimatorEvent() {
        this.map.addEventListener('movestart', this.animatorMovestartEvent.bind(this));
        this.map.addEventListener('moveend', this.animatorMoveendEvent.bind(this));
    }

    show() {
        this.map.addOverlay(this.canvasLayer);
    }

    hide() {
        this.map.removeOverlay(this.canvasLayer);
    }

    draw() {
        this.canvasLayer.draw();
    }
}

export default Layer;
