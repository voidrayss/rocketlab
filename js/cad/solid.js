import { noseGeometry } from "../nose.js";
import { noseConeProfile } from "../rocket.js";
import { ringProperties } from "../rings.js";
// Direct OpenCascade bindings; no mesh-to-solid conversion. Kernel units: mm.
import { validateFinCan } from '../fincan.js';
export function cadJob(oc, job) {
  const objects = [];
  const keep = obj => { objects.push(obj); return obj; };
  const progress = keep(new oc.Message_ProgressRange_1());
  const point = (x,y,z) => keep(new oc.gp_Pnt_3(x,y,z));
  const shapeOf = builder => keep(keep(builder).Shape());
  const boolean = (kind,a,b) => shapeOf(new oc[kind](a,b,progress));
  const count = (s, kind) => {
    const exp = keep(new oc.TopExp_Explorer_2(s,oc.TopAbs_ShapeEnum[kind],oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let n=0; for (;exp.More();exp.Next()) n++;
    return n;
  };
  function inspect(s) {
    const valid = keep(new oc.BRepCheck_Analyzer(s,true,false)).IsValid_2();
    const solids = count(s,'TopAbs_SOLID');
    const props = keep(new oc.GProp_GProps_1());
    oc.BRepGProp.VolumeProperties_1(s,props,true,false,false);
    const centroid = keep(props.CentreOfMass());
    const box = keep(new oc.Bnd_Box_1());
    oc.BRepBndLib.AddOptimal(s,box,false,false);
    const lo=keep(box.CornerMin()), hi=keep(box.CornerMax());
    const xyz=p=>[p.X(),p.Y(),p.Z()];
    const result={valid,solids,volumeMm3:props.Mass(),centroidMm:xyz(centroid),boundsMm:[xyz(lo),xyz(hi)]};
    if (!valid || solids < 1 || !(result.volumeMm3 > 0)) throw new Error('CAD shape is not a valid closed solid.');
    return result;
  }
  function readSTEP(bytes) {
    oc.FS.writeFile('/input.step',bytes);
    const reader=keep(new oc.STEPControl_Reader_1());
    try {
      if (reader.ReadFile('/input.step').value !== oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error('Unable to parse STEP file.');
      if (reader.TransferRoots(progress)<1) throw new Error('STEP file contains no transferable geometry.');
      return keep(reader.OneShape());
    } finally { oc.FS.unlink('/input.step'); }
  }
  function mesh(s,tolerance) {
    keep(new oc.BRepMesh_IncrementalMesh_2(s,tolerance,false,0.25,false));
    const exp=keep(new oc.TopExp_Explorer_2(s,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    const positions=[], indices=[];
    for (;exp.More();exp.Next()) {
      const raw=exp.Current(),face=oc.TopoDS.Face_1(raw), loc=new oc.TopLoc_Location_1();
      const handle=oc.BRep_Tool.Triangulation(face,loc,0);
      if (handle.IsNull()) {handle.delete();loc.delete();face.delete();raw.delete();continue;}
      const tri=handle.get(),trsf=loc.Transformation(),base=positions.length/3;
      for(let i=1;i<=tri.NbNodes();i++) {
        const p=tri.Node(i);p.Transform(trsf);positions.push(p.X(),p.Y(),p.Z());p.delete();
      }
      const reversed=face.Orientation_1().value===oc.TopAbs_Orientation.TopAbs_REVERSED.value;
      for(let i=1;i<=tri.NbTriangles();i++) {
        const t=tri.Triangle(i),a=t.Value(1)-1+base,b=t.Value(2)-1+base,c=t.Value(3)-1+base;
        indices.push(a,...(reversed?[c,b]:[b,c]));t.delete();
      }
      trsf.delete();handle.delete();loc.delete();face.delete();raw.delete();
    }
    return {positions,indices};
  }
  try {
    let shape;
    const component=job.component;
    if (job.action==='import') {
      if (!(job.bytes instanceof Uint8Array) || job.bytes.byteLength > 20000000) throw new Error('STEP import limit is 20 MB.');
      shape=readSTEP(job.bytes);
    } else {
      if (!component || !['body','finCan','ring','nose'].includes(component.type)) throw new Error('Select a manufacturing nose, body tube, fin can or centering ring for CAD export.');
      if (component.type==='finCan') validateFinCan(component);
      if (component.type==='ring') ringProperties(component);
      if(component.type==='nose'){
        if(component.massModel!=='profile-shell'&&!component.shoulderEnabled)throw new Error('Select profile-shell in the nose editor for a CAD-consistent manufacturing mass model.');
        const geometry=noseGeometry(component,noseConeProfile(component,48));
        const points=geometry.profile.filter((p,i,a)=>i===0||Math.hypot(p.x-a[i-1].x,p.r-a[i-1].r)>1e-12).map(p=>point(p.r*1000,0,p.x*1000));
        const wire=keep(new oc.BRepBuilderAPI_MakeWire_1());
        for(let i=0;i<points.length;i++)wire.Add_1(keep(keep(new oc.BRepBuilderAPI_MakeEdge_3(points[i],points[(i+1)%points.length])).Edge()));
        const face=keep(new oc.BRepBuilderAPI_MakeFace_15(keep(wire.Wire()),true));
        const axis=keep(new oc.gp_Ax1_2(point(0,0,0),keep(new oc.gp_Dir_4(0,0,1))));
        shape=shapeOf(new oc.BRepPrimAPI_MakeRevol_1(keep(face.Face()),axis,Math.PI*2,true));
      }else{
      const c=Object.fromEntries(Object.entries(component).map(([k,v])=>[k,typeof v==='number'?v*1000:v]));
      const R=c.diameter/2, r=component.type==='body'?R-c.wallThickness:c.innerDiameter/2;
      if (!(R>r && r>0 && c.length>0 && c.length<=2000)) throw new Error('Invalid sleeve dimensions.');
      shape=boolean('BRepAlgoAPI_Cut_3',shapeOf(new oc.BRepPrimAPI_MakeCylinder_1(R,c.length)),shapeOf(new oc.BRepPrimAPI_MakeCylinder_1(r,c.length)));
      if(component.type==='finCan') for(let n=0;n<component.count;n++) {
        const angle=2*Math.PI*n/component.count,cos=Math.cos(angle),sin=Math.sin(angle);
        const z0=c.length-c.rootChord,root=(R+r)/2;
        const outline=[[root,z0],[R,z0],[R+c.span,z0+c.sweep],[R+c.span,z0+c.sweep+c.tipChord],[R,z0+c.rootChord],[root,z0+c.rootChord]];
        const pts=outline.map(([x,z])=>point(x*cos+c.thickness/2*sin,x*sin-c.thickness/2*cos,z));
        const wire=keep(new oc.BRepBuilderAPI_MakeWire_1());
        for(let i=0;i<pts.length;i++) wire.Add_1(keep(keep(new oc.BRepBuilderAPI_MakeEdge_3(pts[i],pts[(i+1)%pts.length])).Edge()));
        const face=keep(new oc.BRepBuilderAPI_MakeFace_15(keep(wire.Wire()),true));
        const vec=keep(new oc.gp_Vec_4(-c.thickness*sin,c.thickness*cos,0));
        const fin=shapeOf(new oc.BRepPrimAPI_MakePrism_1(keep(face.Face()),vec,true,true));
        shape=boolean('BRepAlgoAPI_Fuse_3',shape,fin);
      }
    }
    }
    const properties=inspect(shape);
    if(job.action!=='import' && properties.solids!==1) throw new Error('Generated part must form exactly one solid.');
    const tolerance=job.toleranceMm ?? .1;
    if(!Number.isFinite(tolerance) || tolerance<.01 || tolerance>2) throw new Error('Mesh tolerance must be 0.01–2 mm.');
    const tessellation=mesh(shape,tolerance);
    if(job.action==='import') return {properties,mesh:tessellation};
    const writer=keep(new oc.STEPControl_Writer_1());
    if(writer.Transfer(shape,oc.STEPControl_StepModelType.STEPControl_AsIs,true,progress).value!==oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error('STEP transfer failed.');
    if(writer.Write('/output.step').value!==oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error('STEP write failed.');
    const step=oc.FS.readFile('/output.step');oc.FS.unlink('/output.step');
    // Reopen the serialized file with the STEP reader, not just the source shape.
    const reopened=inspect(readSTEP(step));
    if(reopened.solids!==properties.solids || Math.abs(reopened.volumeMm3-properties.volumeMm3)>properties.volumeMm3*1e-6) throw new Error('STEP round-trip volume or solid count mismatch.');
    const stlWriter=keep(new oc.StlAPI_Writer());
    if(!stlWriter.Write(shape,'/output.stl',progress)) throw new Error('STL export failed.');
    const stl=oc.FS.readFile('/output.stl');oc.FS.unlink('/output.stl');
    return {properties,reopened,mesh:tessellation,toleranceMm:tolerance,step,stl};
  } finally {
    for(const obj of objects.reverse()) {try {obj.delete();} catch { /* dependent wrappers may already be released */ }}
  }
}
