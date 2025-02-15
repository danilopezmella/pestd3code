
Line 2 (relativeLine: 2, indexline: 0): RSTFLE  PESTMODE
Line 3 (relativeLine: 3, indexline: 1): NPAR  NOBS  NPARGP  NPRIOR  NOBSGP [MAXCOMPDIM] [DERZEROLIM]
Line 4 (relativeLine: 4, indexline: 2): NTPLFLE  NINSFLE  PRECIS  DPOINT [NUMCOM JACFILE MESSFILE] [OBSREREF]
Line 5 (relativeLine: 5, indexline: 3): RLAMBDA1  RLAMFAC  PHIRATSUF  PHIREDLAM  NUMLAM [JACUPDATE] [LAMFORGIVE] [DERFORGIVE]
Line 6 (relativeLine: 6, indexline: 4): RELPARMAX  FACPARMAX  FACORIG [IBOUNDSTICK UPVECBEND] [ABSPARMAX]
Line 7 (relativeLine: 7, indexline: 5): PHIREDSWH [NOPTSWITCH] [SPLITSWH] [DOAUI] [DOSENREUSE] [BOUNDSCALE]
Line 8 (relativeLine: 8, indexline: 6): NOPTMAX PHIREDSTP NPHISTP NPHINORED RELPARSTP NRELPAR [PHISTOPTHRESH] [LASTRUN] [PHIABANDON]
Line 9 (relativeLine: 9, indexline: 7): ICOV ICOR IEIG [IRES] [JCOSAVE] [VERBOSEREC] [JCOSAVEITN] [REISAVEITN] [PARSAVEITN] [PARSAVERUN]





SVD

SVDMODE
MAXSING EIGTHRESH
EIGWRITE

 regularisation 
PHIMLIM  PHIMACCEPT [FRACPHIM] [MEMSAVE]  
WFINIT  WFMIN  WFMAX  [LINREG] [REGCONTINUE] 
WFFAC  WFTOL IREGADJ [NOPTREGADJ REGWEIGHTRAT [REGSINGTHRESH]] 


1,1,control data,RSTFLE,text,“restart” or “norestart”,instructs PEST whether to write restart data,1,1,required,,,,,
2,2,control data,PESTMODE,text,“estimation prediction regularization pareto”,PEST’s mode of operation,1,2,required,,,,,
3,3,control data,NPAR,integer,greater than zero,number of parameters,2,1,required,,,,,
4,4,control data,NOBS,integer,greater than zero,number of observations,2,2,required,,,,,
5,5,control data,NPARGP,integer,greater than zero,number of parameter groups,2,3,required,,,,,
6,6,control data,NPRIOR,integer,any integer value,absolute value is number of prior information equations. Negative value indicates supply of prior information in indexed format,2,4,required,,,,,
7,7,control data,NOBSGP,integer,greater than zero,number of observation groups,2,5,required,,,,,
8,8,control data,MAXCOMPDIM,integer,zero or greater,number of elements in compressed Jacobian matrix,2,6,optional,,,,,
9,9,control data,NTPLFLE,integer,greater than zero,number of template files,3,1,required,,,,,
10,10,control data,NINSFLE,integer,greater than zero,number of instruction files,3,2,required,,,,,
11,11,control data,PRECIS,text,“single” or “double”,format for writing parameter values to model input files,3,3,required,,,,,
12,12,control data,DPOINT,text,“point” or “nopoint”,omit decimal point in parameter values if possible,3,4,required,,,,,
13,13,control data,NUMCOM,integer,greater than zero,number of command lines used to run model,3,5,optional,,,,,
14,14,control data,JACFILE,integer,0  1 or -1,indicates whether model provides external derivatives file,3,6,optional,,,,,
15,15,control data,MESSFILE,integer,zero or one, indicates whether PEST writes PEST-to-model message file,3,7,optional,,,,,
16,16,control data,OBSREREF,text,“obsreref” “obsreref_N” or “noobsreref”, activates or de-activates observation re-referencing (with an optional pause after re-referencing runs),3,8,optional,,,,,
17,17,control data,RLAMBDA1,real,zero or greater,initial Marquardt lambda,4,1,required,,,,,
18,18,control data,RLAMFAC,real,positive or negative but not zero,dictates Marquardt lambda adjustment process,4,2,required,,,,,
19,19,control data,PHIRATSUF,real,between zero and one,fractional objective function sufficient for end of current iteration,4,3,required,,,,,
20,20,control data,PHIREDLAM,real,between zero and one,termination criterion for Marquardt lambda search,4,4,required,,,,,
21,21,control data,NUMLAM,integer,one or greater. Possibly negative with Parallel or BEOPEST,maximum number of Marquardt lambdas to test,4,5,required,,,,,
22,22,control data,JACUPDATE,integer,zero or greater,activation of Broyden’s Jacobian update procedure,4,6,optional,,,,,
23,23,control data,LAMFORGIVE,text,“lamforgive” or “nolamforgive”,treat model run failure during lambda search as high objective function,4,7,optional,,,,,
24,24,control data,DERFORGIVE,text,“derforgive” or “noderforgive”,accommodates model failure during Jacobian runs by setting pertinent sensitivities to zero,4,8,optional,,,,,
25,25,control data,RELPARMAX,real,greater than zero,parameter relative change limit,5,1,required,,,,,
26,26,control data,FACPARMAX,real,greater than one,parameter factor change limit,5,2,required,,,,,
27,27,control data,FACORIG,real,between zero and one,minimum fraction of original parameter value in evaluating relative change,5,3,required,,,,,
29,29,control data,IBOUNDSTICK,integer,zero or greater,instructs PEST not to compute derivatives for parameter at its bounds,5,4,optional,,,,,
30,30,control data,UPVECBEND,integer,zero or one,instructs PEST to bend parameter upgrade vector if parameter hits bounds,5,5,optional,,,,,
31,31,control data,PHIREDSWH,real,between zero and one,sets objective function change for introduction of central derivatives,6,1,required,,,,,
32,32,control data,NOPTSWITCH,integer,one or greater,iteration before which PEST will not switch to central derivatives computation,6,2,optional,,,,,
33,33,control data,SPLITSWH,real,zero or greater,the factor by which the objective function rises to invoke split slope derivatives analysis until end of run,6,3,optional,,,,,
34,34,control data,DOAUI,text,“aui” “auid” or “noaui”,instructs PEST to implement automatic user intervention,6,4,optional,,,,,
35,35,control data,DOSENREUSE,text,“senreuse” or “nosenreuse”,instructs PEST to reuse parameter sensitivities,6,5,optional,,,,,
36,36,control data,BOUNDSCALE,text,“boundscale” or “noboundscale”,parameters are scaled by the inter-bounds interval if using singular value decomposition  LSQR or SVDA,6,6,optional,,,,,
37,37,control data,NOPTMAX,integer,-2 -1 0 or any number greater than zero,number of optimization iterations,7,1,required,,,,,
38,38,control data,PHIREDSTP,real,greater than zero,relative objective function reduction triggering termination,7,2,required,,,,,
39,39,control data,NPHISTP,integer,greater than zero,number of successive iterations over which PHIREDSTP applies,7,3,required,,,,,
40,40,control data,NPHINORED,integer,greater than zero,number of iterations since last drop in objective function to trigger termination,7,4,required,,,,,
41,41,control data,RELPARSTP,real,greater than zero,maximum relative parameter change triggering termination,7,5,required,,,,,
42,42,control data,NRELPAR,integer,greater than zero,number of successive iterations over which RELPARSTP applies,7,6,required,,,,,
43,43,control data,PHISTOPTHRESH,real,zero or greater,objective function threshold triggering termination,7,7,optional,,,,,
44,44,control data,LASTRUN,integer,zero or one,instructs PEST to undertake (or not) final model run with best parameters,7,8,optional,,,,,
45,45,control data,PHIABANDON,real,a positive number or name of a file,objective function value at which to abandon optimization process or filename containing abandonment schedule,7,9,optional,,,,,
46,46,control data,ICOV,integer,zero or one,record covariance matrix in matrix file,8,1,required,,,,,
47,47,control data,ICOR,integer,zero or one,record correlation coefficient matrix in matrix file,8,2,required,,,,,
48,48,control data,IEIG,integer,zero or one,record eigenvectors in matrix file,8,3,required,,,,,
49,49,control data,IRES,integer,zero or one,record resolution data,8,4,optional,,,,,
50,50,control data,JCOSAVE,text,“jcosave” or “nojcosave”,save best Jacobian file as a JCO file - overwriting previously saved files of the same name as the inversion process progresses,8,5,optional,,,,,
51,51,control data,VERBOSEREC,text,“verboserec” or “noverboserec”,if set to “noverboserec” parameter and observation data lists are omitted from the run record file,8,6,optional,,,,
52,52,control data,JCOSAVEITN,text,“jcosaveitn” or “nojcosaveitn”,write current Jacobian matrix to iteration-specific JCO file at the end of every optimization iteration,8,7,optional,,,,,
53,53,control data,REISAVEITN,text,“reisaveitn” or “noreisaveitn”,store best-fit residuals to iteration-specific residuals file at end of every optimization iteration,8,8,optional,,,,,
54,54,control data,PARSAVEITN,text,“parsaveitn” or “noparsaveitn”,store iteration specific parameter value files,8,9,optional,,,,,
55,55,control data,PARSAVERUN,text,“parsaverun” or “noparsaverun”,store run specific parameter value files,8,10,optional,,,,,
71,71,singular value decomposition,SVDMODE,integer,zero or one,activates truncated singular value decomposition for solution of inverse problem,#N/A,#N/A,#N/A,,,,,
72,72,singular value decomposition,MAXSING,integer,greater than zero,number of singular values at which truncation occurs,#N/A,#N/A,#N/A,,,,,
73,73,singular value decomposition,EIGTHRESH,real,zero or greater but less than one,eigenvalue ratio threshold for truncation,#N/A,#N/A,#N/A,,,,,
74,74,singular value decomposition,EIGWRITE,integer,zero or one,determines co
145,145,regularization,PHIMLIM,real,greater than zero,target measurement objective function,1,1,required,,,,,
146,146,regularization,PHIMACCEPT,real,greater than PHIMLIM,acceptable measurement objective function,1,2,required,,,,,
147,147,regularization,FRACPHIM,real,zero or greater,set target measurement objective function at this fraction of current measurement objective function set target measurement objective function at this fraction of current measurement objective function,1,3,optional,,,,
148,148,regularization,MEMSAVE,text,"memsave or ""nomemsave""",activate conservation of memory at cost of execution speed and quantity of model output,1,4,optional,,,,,
149,149,regularization,WFINIT,real,greater than zero,initial regularization weight factor,2,1,required,,,,,
150,150,regularization,WFMIN,real,greater than zero,minimum regularization weight factor,2,2,required,,,,,
151,151,regularization,WFMAX,real,greater than WFMAX,maximum regularization weight factor,2,3,required,,,,,
152,152,regularization,LINREG,text,"linreg or ""nonlinreg""",informs PEST that all regularization constraints are linear,2,4,optional,,,,,
153,153,regularization,REGCONTINUE,text,"continue or ""nocontinue""",instructs PEST to continue minimising regularization objective function even if measurement objective function less than PHIMLIM,2,5,optional,,,,,
154,154,regularization,WFFAC,real,greater than one,regularization weight factor adjustment factor,3,1,required,,,,,
155,155,regularization,WFTOL,real,greater than zero,convergence criterion for regularization weight factor,3,2,required,,,,,
156,156,regularization,IREGADJ,integer,0,instructs PEST to perform inter-regularization group weight factor adjustment or to compute new relative weights for regularization observations and prior information equations 2 3  4 or 5 instructs PEST to perform inter-regularization group weight factor adjustment or to compute new relative weights for regularization observations and prior information equations,3,3,required
157,157,regularization,NOPTREGADJ,integer,one or greater,the optimization iteration interval for re-calculation of regularization weights if IREGADJ is 4 or 5,3,4,optional,,,,,
158,158,regularization,REGWEIGHTRAT,real,absolute value of one or greater,the ratio of highest to lowest regularization weight; spread is logarithmic with null space projection if set negative,3,5,optional,,,,,
159,159,regularization,REGSINGTHRESH,real,less than one and greater than zero,singular value of JtQJ (as factor of highest singular value) at which use of higher regularization weights commences if IREGADJ is set to 5,3,6,optional,,,,,


