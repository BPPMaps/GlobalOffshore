ol.proj.proj4.register(proj4);
//ol.proj.get("EPSG:4326").setExtent([-35.592242, 10.004187, 71.135029, 76.340357]);
var wms_layers = [];


        var lyr_GoogleSatellite_0 = new ol.layer.Tile({
            'title': 'Google Satellite',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
            attributions: ' ',
                url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
            })
        });
var format_FOUManufacture_1 = new ol.format.GeoJSON();
var features_FOUManufacture_1 = format_FOUManufacture_1.readFeatures(json_FOUManufacture_1, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'});
var jsonSource_FOUManufacture_1 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_FOUManufacture_1.addFeatures(features_FOUManufacture_1);
cluster_FOUManufacture_1 = new ol.source.Cluster({
  distance: 30,
  source: jsonSource_FOUManufacture_1
});
var lyr_FOUManufacture_1 = new ol.layer.Vector({
                declutter: false,
                source:cluster_FOUManufacture_1, 
                style: style_FOUManufacture_1,
                popuplayertitle: 'FOU Manufacture',
                interactive: true,
                title: '<img src="styles/legend/FOUManufacture_1.png" /> FOU Manufacture'
            });

lyr_GoogleSatellite_0.setVisible(true);lyr_FOUManufacture_1.setVisible(true);
var layersList = [lyr_GoogleSatellite_0,lyr_FOUManufacture_1];
lyr_FOUManufacture_1.set('fieldAliases', {'Manufacture': 'Manufacture', 'Fascility': 'Fascility', 'Region': 'Region', 'Country': 'Country', 'Main product': 'Main product', '2nd product': '2nd product', '3rd product': '3rd product', 'Annual Output': 'Annual Output', 'Annual capacity (t/year)': 'Annual capacity (t/year)', 'Max diameter (m)': 'Max diameter (m)', 'Max weight poduct (t)': 'Max weight poduct (t)', 'Max plate thickness (mm)': 'Max plate thickness (mm)', 'Address': 'Address', 'Production floor (m^2)': 'Production floor (m^2)', 'Total area (ha)': 'Total area (ha)', 'Logistic notes': 'Logistic notes', 'Lat': 'Lat', 'Long': 'Long', });
lyr_FOUManufacture_1.set('fieldImages', {'Manufacture': '', 'Fascility': '', 'Region': '', 'Country': '', 'Main product': '', '2nd product': '', '3rd product': '', 'Annual Output': '', 'Annual capacity (t/year)': '', 'Max diameter (m)': '', 'Max weight poduct (t)': '', 'Max plate thickness (mm)': '', 'Address': '', 'Production floor (m^2)': '', 'Total area (ha)': '', 'Logistic notes': '', 'Lat': '', 'Long': '', });
lyr_FOUManufacture_1.set('fieldLabels', {'Manufacture': 'header label - always visible', 'Fascility': 'header label - always visible', 'Region': 'header label - always visible', 'Country': 'header label - always visible', 'Main product': 'header label - always visible', '2nd product': 'header label - always visible', '3rd product': 'header label - always visible', 'Annual Output': 'header label - always visible', 'Annual capacity (t/year)': 'header label - always visible', 'Max diameter (m)': 'header label - always visible', 'Max weight poduct (t)': 'header label - always visible', 'Max plate thickness (mm)': 'header label - visible with data', 'Address': 'header label - visible with data', 'Production floor (m^2)': 'header label - visible with data', 'Total area (ha)': 'header label - visible with data', 'Logistic notes': 'header label - always visible', 'Lat': 'header label - always visible', 'Long': 'header label - always visible', });
lyr_FOUManufacture_1.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});