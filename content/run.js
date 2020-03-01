"use strict";

function drawTimes(data, status, xhr) {
    var id = xhr["id"];
    $(`#times tr:eq(${id})`).html(`<td colspan=2 class="station">${data.stationName}</td>`)
    $(`#times tr:eq(${id+1})`).html(`<td>${data.direction1.name}</td><td>${data.direction1.times.map(time => `<span class="route route-${time.route}">${time.route}</span> ${time.minutes}`).join(" ")}</td>`)
    $(`#times tr:eq(${id+2})`).html(`<td>${data.direction2.name}</td><td>${data.direction2.times.map(time => `<span class="route route-${time.route}">${time.route}</span> ${time.minutes}`).join(" ")}</td>`)
}

var nextid = 0;

function request(url) {
    $("#times").append("<tr></tr><tr></tr><tr></tr>")
    $.ajax({
        dataType: "json",
        url: url,
        success: drawTimes,
    })["id"] = nextid * 3;
nextid++;
}

function load() {
    request("https://mtasubwaytime.info/getTime/2/231");
    request("https://mtasubwaytime.info/getTime/2/137");
    request("https://mtasubwaytime.info/getTime/2/134");
    request("https://mtasubwaytime.info/getTime/C/A33");
    request("https://mtasubwaytime.info/getTime/C/A34");
    request("https://mtasubwaytime.info/getTime/C/A40");
}
